// Renders the core off-host to PPM files so the curl can be checked without After Effects.
// Usage: render_core <out_dir>
#include "../src/PageTurnCore.h"
#include <cstdio>
#include <string>
#include <vector>

struct Img {
    int w, h;
    std::vector<ptp::RGBA> px;
};

struct Fetch {
    const Img *img;
    ptp::RGBA operator()(int x, int y) const {
        if (x < 0 || y < 0 || x >= img->w || y >= img->h) return {};
        return img->px[y * img->w + x];
    }
};

static Img pattern(int w, int h, bool back) {
    Img im{w, h, std::vector<ptp::RGBA>(w * h)};
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            float fx = (float)x / w, fy = (float)y / h;
            ptp::RGBA c = back ? ptp::RGBA{0.2f, 0.45f + 0.3f * fy, 0.85f, 1} : ptp::RGBA{1 - fy * 0.6f, fx, 0.3f + 0.7f * fy, 1};
            bool grid = (x % 50) < 3 || (y % 50) < 3;
            if (back && ((x / 25 + y / 25) % 2)) c = {0.95f, 0.85f, 0.3f, 1};
            if (grid && !back) c = {0.1f, 0.1f, 0.1f, 1};
            im.px[y * w + x] = c;
        }
    return im;
}

static void write(const std::string &path, const ptp::Params &p, const Img &src, const Img *backImg) {
    ptp::Sampler<Fetch> s{Fetch{&src}, src.w, src.h};
    ptp::Sampler<Fetch> b{Fetch{backImg}, backImg ? backImg->w : 0, backImg ? backImg->h : 0};
    ptp::Renderer<Fetch, Fetch> r(p, s, backImg ? &b : nullptr);
    int pad = 460, W = src.w + 2 * pad, H = src.h + 2 * pad;
    FILE *f = std::fopen(path.c_str(), "wb");
    std::fprintf(f, "P6 %d %d 255\n", W, H);
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++) {
            ptp::RGBA c = r.pixel(x - pad + 0.5f, y - pad + 0.5f);
            float bg = ((x / 20 + y / 20) % 2) ? 0.55f : 0.45f;
            unsigned char o[3];
            float ch[3] = {c.r, c.g, c.b};
            for (int i = 0; i < 3; i++) {
                float v = ch[i] + bg * (1 - c.a);
                o[i] = (unsigned char)(std::min(std::max(v, 0.0f), 1.0f) * 255 + 0.5f);
            }
            std::fwrite(o, 1, 3, f);
        }
    std::fclose(f);
    ptp::Rect bb = r.geometry().bounds();
    std::printf("%s bounds %.0f %.0f %.0f %.0f\n", path.c_str(), bb.left, bb.top, bb.right, bb.bottom);
}

int main(int argc, char **argv) {
    std::string dir = argc > 1 ? argv[1] : ".";
    Img src = pattern(400, 500, false), back = pattern(300, 300, true);
    float steps[] = {0.15f, 0.35f, 0.55f, 0.75f, 1.0f};
    for (int i = 0; i < 5; i++) {
        ptp::Params p;
        p.progress = steps[i];
        p.supersample = 2;
        write(dir + "/book_" + std::to_string(i) + ".ppm", p, src, &back);
    }
    ptp::Params p;
    p.progress = 0.4f; p.supersample = 2;
    p.cone = 0; write(dir + "/cone0.ppm", p, src, &back);
    p.cone = 1.5f; write(dir + "/cone150.ppm", p, src, &back);
    p.cone = 0.5f; p.bend = 0.8f; write(dir + "/bend.ppm", p, src, &back);
    p.bend = 0; p.vertical = true; p.corner = ptp::BottomLeft; write(dir + "/vertical.ppm", p, src, &back);
    p.vertical = false; p.corner = ptp::TopLeft; p.tiltDeg = 45; write(dir + "/peel_tl.ppm", p, src, nullptr);
    p.render = ptp::RenderShadowOnly; write(dir + "/shadow_only.ppm", p, src, nullptr);
    return 0;
}
