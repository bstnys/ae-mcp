// Page Turn Pro rendering core. Pure C++ with no After Effects dependency, so the
// curl geometry, lighting and shadows can be tested off-host (see effect/test).
//
// Coordinates are layer pixels with y down. The page occupies [0,w] x [0,h].
// The fold travels from the start corner C in unit direction d; u is distance
// along d from C, v is distance along e (d rotated 90 degrees). Paper behind the
// fold line (u < s) wraps over a cylinder of radius r lying on the page and lands
// flipped on top of the remaining page, exactly like CC Page Turn's Classic UI,
// but with per-row radius (cone), a curved fold line (bend), real normals for
// diffuse and specular light, and a cast shadow.
#pragma once

#include <algorithm>
#include <cmath>

namespace ptp {

struct RGBA {
    float r = 0, g = 0, b = 0, a = 0; // premultiplied, 0..1
};

inline RGBA over(const RGBA &top, const RGBA &bottom) {
    float k = 1.0f - top.a;
    return {top.r + bottom.r * k, top.g + bottom.g * k, top.b + bottom.b * k, top.a + bottom.a * k};
}

enum Corner { TopLeft = 0, TopRight = 1, BottomLeft = 2, BottomRight = 3 };
enum BackMirror { MirrorAuto = 0, MirrorNone = 1, MirrorHorizontal = 2, MirrorVertical = 3 };
enum RenderMode { RenderFull = 0, RenderNoShadow = 1, RenderTurnedOnly = 2, RenderShadowOnly = 3, RenderFrontOnly = 4 };

struct Params {
    // Turn
    float progress = 0;      // 0..1
    int corner = BottomRight;
    bool vertical = false;   // turn up/down (calendar) instead of left/right (book)
    float tiltDeg = 20;      // tilts the travel direction toward the opposite edge
    float tiltRecovery = 1;  // 0..1, how much the tilt straightens out by the end of the turn
    float ease = 0.6f;       // 0..1 blend toward smoothstep
    float overshoot = 0;     // 0..1
    // Curl
    float radius = 30;       // px
    float bulge = 60;        // extra radius at mid turn, px
    float cone = 0.5f;       // -1..1, radius change away from the start corner
    float bend = 0;          // -1..1, curvature of the fold line mid turn
    // Light
    float lightAngleDeg = -45; // 0 = from the top, clockwise
    float lightHeightDeg = 45;
    float ambient = 0.35f;
    float specular = 0.35f;
    float shininess = 24;
    // Shadow
    float shadowColor[3] = {0, 0, 0};
    float shadowOpacity = 0.5f;
    float shadowAngleDeg = 135; // direction the shadow falls, same as Drop Shadow
    float shadowDistance = 18;  // px at full lift
    float shadowSoftness = 24;  // px
    float contact = 0.45f;      // darkening under the curl, 0..1
    // Back page
    float paper[3] = {0.93f, 0.92f, 0.88f};
    float backOpacity = 1;   // how much of the back layer shows over paper color
    int backMirror = MirrorAuto;
    float backOffset[2] = {0, 0};
    float backScale = 1;
    float backRotDeg = 0;
    // Output
    int render = RenderFull;
    int supersample = 1;     // 1..4 per axis
};

// Bilinear sampler over a premultiplied image accessed through Fetch(x, y) -> RGBA,
// which must return transparent black outside the image.
template <class Fetch>
struct Sampler {
    Fetch fetch;
    int w = 0, h = 0;

    RGBA at(float x, float y) const {
        float fx = x - 0.5f, fy = y - 0.5f;
        float x0f = std::floor(fx), y0f = std::floor(fy);
        int x0 = (int)x0f, y0 = (int)y0f;
        if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) return {};
        float tx = fx - x0f, ty = fy - y0f;
        RGBA a = fetch(x0, y0), b = fetch(x0 + 1, y0), c = fetch(x0, y0 + 1), d = fetch(x0 + 1, y0 + 1);
        float wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
        return {a.r * wa + b.r * wb + c.r * wc + d.r * wd, a.g * wa + b.g * wb + c.g * wc + d.g * wd,
                a.b * wa + b.b * wb + c.b * wc + d.b * wd, a.a * wa + b.a * wb + c.a * wc + d.a * wd};
    }
};

struct Rect {
    float left, top, right, bottom;
};

class Geometry {
public:
    Geometry(const Params &p, float pageW, float pageH) : P(p), w(pageW), h(pageH) {
        const float pi = 3.14159265f;
        float pr = std::min(std::max(p.progress, 0.0f), 1.0f);
        float e = std::min(std::max(p.ease, 0.0f), 1.0f);
        t = pr + (pr * pr * (3 - 2 * pr) - pr) * e;
        float o = std::max(p.overshoot, 0.0f) * 0.8f;
        t = t + o * std::sin(pi * t) * t * t * t;
        tt = std::min(std::max(t, 0.0f), 1.0f);
        lift = std::sin(pi * tt);
        r = std::max(0.5f, p.radius + p.bulge * lift);

        bool right = p.corner == TopRight || p.corner == BottomRight;
        bool bottom = p.corner == BottomLeft || p.corner == BottomRight;
        cx = right ? w : 0;
        cy = bottom ? h : 0;
        float sx = right ? -1.0f : 1.0f, sy = bottom ? -1.0f : 1.0f;
        float a = p.tiltDeg * (1 - std::min(std::max(p.tiltRecovery, 0.0f), 1.0f) * tt) * pi / 180.0f;
        float bx = p.vertical ? 0 : sx, by = p.vertical ? sy : 0;
        float qx = p.vertical ? sx : 0, qy = p.vertical ? 0 : sy;
        dx = bx * std::cos(a) + qx * std::sin(a);
        dy = by * std::cos(a) + qy * std::sin(a);
        ex = -dy;
        ey = dx;

        float cs[4][2] = {{0, 0}, {w, 0}, {0, h}, {w, h}};
        m = 0;
        vmin = 1e30f;
        vmax = -1e30f;
        for (auto &c : cs) {
            float u = (c[0] - cx) * dx + (c[1] - cy) * dy;
            float v = (c[0] - cx) * ex + (c[1] - cy) * ey;
            m = std::max(m, u);
            vmin = std::min(vmin, v);
            vmax = std::max(vmax, v);
        }
        span = std::max(vmax - vmin, 1.0f);
        s = t * (m + pi * r * 0.5f);

        float la = p.lightAngleDeg * pi / 180.0f, le = p.lightHeightDeg * pi / 180.0f;
        lx = std::cos(le) * std::sin(la);
        ly = -std::cos(le) * std::cos(la);
        lz = std::sin(le);
        float hx = lx, hy = ly, hz = lz + 1;
        float hl = std::sqrt(hx * hx + hy * hy + hz * hz);
        hvx = hx / hl;
        hvy = hy / hl;
        hvz = hz / hl;
        amb = std::min(std::max(p.ambient, 0.0f), 1.0f);
        flatDiffuse = amb + (1 - amb) * std::max(lz, 0.0f);
        flatSpec = std::pow(std::max(hvz, 0.0f), p.shininess);

        float sa = p.shadowAngleDeg * pi / 180.0f;
        shx = std::sin(sa) * p.shadowDistance;
        shy = -std::cos(sa) * p.shadowDistance;

        mirror = p.backMirror;
        if (mirror == MirrorAuto) mirror = p.vertical ? MirrorVertical : MirrorHorizontal;
        float br = p.backRotDeg * pi / 180.0f;
        bcos = std::cos(br);
        bsin = std::sin(br);
    }

    // Fold line offset and curl radius for the row at v.
    void row(float v, float &sv, float &rv) const {
        float vn = ((v - vmin) / span) * 2 - 1;               // -1..1 across the fold
        float vc = std::min(std::abs(v) / span, 1.0f);         // 0 at the start corner
        sv = s - P.bend * 0.25f * span * vn * vn * lift;
        rv = std::max(0.5f, r * (1 + P.cone * vc));
    }

    void toUV(float x, float y, float &u, float &v) const {
        u = (x - cx) * dx + (y - cy) * dy;
        v = (x - cx) * ex + (y - cy) * ey;
    }
    void toXY(float u, float v, float &x, float &y) const {
        x = cx + dx * u + ex * v;
        y = cy + dy * u + ey * v;
    }

    // Where a point of the page (material coordinates) samples the back layer.
    void backCoord(float x, float y, float backW, float backH, float &bx, float &by) const {
        if (mirror == MirrorHorizontal) x = w - x;
        if (mirror == MirrorVertical) y = h - y;
        float px = x - w * 0.5f - P.backOffset[0], py = y - h * 0.5f - P.backOffset[1];
        float sc = std::max(P.backScale, 0.001f);
        bx = (px * bcos + py * bsin) / sc + backW * 0.5f;
        by = (-px * bsin + py * bcos) / sc + backH * 0.5f;
    }

    // Light factor for a surface normal, normalised so flat paper is unchanged.
    void light(float nx, float ny, float nz, float &diffuse, float &spec) const {
        float ndl = nx * lx + ny * ly + nz * lz;
        diffuse = (amb + (1 - amb) * std::max(ndl, 0.0f)) / std::max(flatDiffuse, 0.05f);
        float ndh = std::max(nx * hvx + ny * hvy + nz * hvz, 0.0f);
        spec = P.specular * std::max(std::pow(ndh, P.shininess) - flatSpec, 0.0f);
    }

    // Area that can contain output pixels, in layer pixels.
    Rect bounds() const {
        float pad = 2 * r * (1 + std::abs(P.cone)) + std::abs(P.bend) * 0.25f * span +
                    std::abs(P.shadowDistance) + std::abs(P.shadowSoftness) + 4;
        Rect b = {0, 0, w, h};
        float cs[4][2] = {{0, 0}, {w, 0}, {0, h}, {w, h}};
        float axis = s - 3.14159265f * r * 0.5f; // the flat flap mirrors around this line
        for (auto &c : cs) {
            float u, v, x, y;
            toUV(c[0], c[1], u, v);
            toXY(2 * axis - u, v, x, y);
            b.left = std::min(b.left, x);
            b.top = std::min(b.top, y);
            b.right = std::max(b.right, x);
            b.bottom = std::max(b.bottom, y);
        }
        return {b.left - pad, b.top - pad, b.right + pad, b.bottom + pad};
    }

    const Params &P;
    float w, h;
    float t, tt, lift, r, s, m;
    float cx, cy, dx, dy, ex, ey;
    float vmin, vmax, span;
    float lx, ly, lz, hvx, hvy, hvz, amb, flatDiffuse, flatSpec;
    float shx, shy;
    int mirror;
    float bcos, bsin;
};

// One page sample split into what lies on top of the shadow (the turned paper)
// and what lies under it (the unturned page).
struct Layers {
    RGBA turned;
    RGBA front;
};

template <class SrcFetch, class BackFetch>
class Renderer {
public:
    Renderer(const Params &p, const Sampler<SrcFetch> &src, const Sampler<BackFetch> *back)
        : P(p), G(p, (float)src.w, (float)src.h), src(src), back(back) {}

    const Geometry &geometry() const { return G; }

    // Final premultiplied color of the output pixel whose centre is (x, y) in layer pixels.
    RGBA pixel(float x, float y) const {
        int n = std::min(std::max(P.supersample, 1), 4);
        RGBA turned, front;
        for (int j = 0; j < n; j++) {
            for (int i = 0; i < n; i++) {
                float ox = (i + 0.5f) / n - 0.5f, oy = (j + 0.5f) / n - 0.5f;
                Layers l = layers(x + ox, y + oy);
                turned.r += l.turned.r; turned.g += l.turned.g; turned.b += l.turned.b; turned.a += l.turned.a;
                front.r += l.front.r; front.g += l.front.g; front.b += l.front.b; front.a += l.front.a;
            }
        }
        float k = 1.0f / (n * n);
        turned = {turned.r * k, turned.g * k, turned.b * k, turned.a * k};
        front = {front.r * k, front.g * k, front.b * k, front.a * k};

        switch (P.render) {
        case RenderTurnedOnly: return turned;
        case RenderFrontOnly: return front;
        case RenderNoShadow: return over(turned, front);
        default: break;
        }
        float sa = shadow(x, y);
        RGBA sh = {P.shadowColor[0] * sa, P.shadowColor[1] * sa, P.shadowColor[2] * sa, sa};
        if (P.render == RenderShadowOnly) return sh;
        return over(turned, over(sh, front));
    }

    Layers layers(float x, float y) const {
        Layers out;
        float u, v, sv, rv;
        G.toUV(x, y, u, v);
        G.row(v, sv, rv);
        const float pi = 3.14159265f;

        // Flat flap: paper that has gone fully over, lying back side up at height 2r.
        if (u >= sv) {
            float l = u - sv + pi * rv;
            out.turned = backFace(sv - l, v, 0, 0, 1);
            out.front = frontFace(u, v, 0, 0, 1);
        }
        // Cylinder: the back side on its upper half covers the front side on its lower half.
        float k = sv - u;
        if (k >= 0 && k <= rv) {
            float phi1 = std::asin(std::min(k / rv, 1.0f));
            float phi2 = pi - phi1;
            float ddx = G.dx, ddy = G.dy;
            RGBA top = backFace(sv - rv * phi2, v, -ddx * std::sin(phi2), -ddy * std::sin(phi2), -std::cos(phi2));
            RGBA low = frontFace(sv - rv * phi1, v, ddx * std::sin(phi1), ddy * std::sin(phi1), std::cos(phi1));
            out.turned = over(out.turned, over(top, low));
        }
        return out;
    }

    // Opacity of the turned paper at (x, y), used as the shadow caster.
    float casterAlpha(float x, float y) const {
        float u, v, sv, rv;
        G.toUV(x, y, u, v);
        G.row(v, sv, rv);
        const float pi = 3.14159265f;
        float a = 0;
        if (u >= sv) a = srcAlpha(sv - (u - sv + pi * rv), v);
        float k = sv - u;
        if (k >= 0 && k <= rv) {
            float phi1 = std::asin(std::min(k / rv, 1.0f));
            float a2 = srcAlpha(sv - rv * (pi - phi1), v);
            float a1 = srcAlpha(sv - rv * phi1, v);
            float c = a2 + a1 * (1 - a2);
            a = a + c * (1 - a);
        }
        return a;
    }

    float shadow(float x, float y) const {
        if (G.tt <= 0 || G.tt >= 1) return 0;
        // Cast shadow: the turned paper's footprint, offset away from the light and
        // softened with a fixed disk of taps.
        static const float taps[13][2] = {{0, 0},         {1, 0},          {-1, 0},       {0, 1},
                                          {0, -1},        {0.7f, 0.7f},    {-0.7f, 0.7f}, {0.7f, -0.7f},
                                          {-0.7f, -0.7f}, {0.5f, 0},       {-0.5f, 0},    {0, 0.5f},
                                          {0, -0.5f}};
        float ox = G.shx * G.lift, oy = G.shy * G.lift;
        float soft = std::max(P.shadowSoftness, 0.0f) * 0.5f;
        int n = soft < 0.5f ? 1 : 13;
        float cast = 0;
        for (int i = 0; i < n; i++) cast += casterAlpha(x - ox + taps[i][0] * soft, y - oy + taps[i][1] * soft);
        cast = cast / n * P.shadowOpacity;

        // Contact shadow under and just ahead of the curl, only where paper is lifting.
        float u, v, sv, rv;
        G.toUV(x, y, u, v);
        G.row(v, sv, rv);
        float lifting = srcAlpha(sv - 1, v);
        float dist = std::abs(u - sv + rv * 0.5f);
        float contact = P.contact * lifting * std::exp(-dist / (rv * 0.9f + 1)) * std::min(G.lift * 4, 1.0f);
        return 1 - (1 - std::min(cast, 1.0f)) * (1 - std::min(contact, 1.0f));
    }

private:
    float srcAlpha(float um, float v) const {
        float x, y;
        G.toXY(um, v, x, y);
        return src.at(x, y).a;
    }

    RGBA frontFace(float um, float v, float nx, float ny, float nz) const {
        float x, y;
        G.toXY(um, v, x, y);
        RGBA c = src.at(x, y);
        if (c.a <= 0) return {};
        float dif, sp;
        G.light(nx, ny, nz, dif, sp);
        return shade(c, dif, sp);
    }

    RGBA backFace(float um, float v, float nx, float ny, float nz) const {
        float x, y;
        G.toXY(um, v, x, y);
        float a = src.at(x, y).a;
        if (a <= 0) return {};
        float r = P.paper[0], g = P.paper[1], b = P.paper[2];
        if (back) {
            float bx, by;
            G.backCoord(x, y, (float)back->w, (float)back->h, bx, by);
            RGBA bc = back->at(bx, by);
            float k = std::min(std::max(P.backOpacity, 0.0f), 1.0f);
            // bc is premultiplied: blend its straight color over paper by its alpha.
            r = r * (1 - k * bc.a) + bc.r * k;
            g = g * (1 - k * bc.a) + bc.g * k;
            b = b * (1 - k * bc.a) + bc.b * k;
        }
        float dif, sp;
        G.light(nx, ny, nz, dif, sp);
        return shade({r * a, g * a, b * a, a}, dif, sp);
    }

    static RGBA shade(const RGBA &c, float dif, float sp) {
        return {std::min(c.r * dif + sp * c.a, c.a), std::min(c.g * dif + sp * c.a, c.a),
                std::min(c.b * dif + sp * c.a, c.a), c.a};
    }

    const Params &P;
    Geometry G;
    const Sampler<SrcFetch> &src;
    const Sampler<BackFetch> *back;
};

} // namespace ptp
