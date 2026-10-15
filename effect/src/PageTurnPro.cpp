// Page Turn Pro: After Effects effect glue around PageTurnCore.h.
// 8 and 16 bpc, non-SmartFX, rows rendered in parallel with iterate_generic.

#include "PageTurnPro.h"
#include "PageTurnCore.h"

#if defined(__has_include)
#if __has_include("AE_PluginData.h")
#include "AE_PluginData.h"
#endif
#endif

#include <algorithm>
#include <cmath>
#include <cstring>

namespace {

// ---- Pixel access ----------------------------------------------------------
// After Effects hands effects straight (unpremultiplied) pixels; the core works
// in premultiplied float, so convert on read and write.

struct WorldFetch {
    const char *base = nullptr;
    A_long rowbytes = 0;
    int w = 0, h = 0;
    bool deep = false;

    ptp::RGBA operator()(int x, int y) const {
        if (!base || x < 0 || y < 0 || x >= w || y >= h) return {};
        if (deep) {
            const PF_Pixel16 *p = reinterpret_cast<const PF_Pixel16 *>(base + (size_t)y * rowbytes) + x;
            float a = p->alpha / (float)PF_MAX_CHAN16;
            float k = a / (float)PF_MAX_CHAN16;
            return {p->red * k, p->green * k, p->blue * k, a};
        }
        const PF_Pixel8 *p = reinterpret_cast<const PF_Pixel8 *>(base + (size_t)y * rowbytes) + x;
        float a = p->alpha / 255.0f;
        float k = a / 255.0f;
        return {p->red * k, p->green * k, p->blue * k, a};
    }
};

WorldFetch fetchFor(const PF_EffectWorld *world) {
    WorldFetch f;
    if (world && world->data) {
        f.base = reinterpret_cast<const char *>(world->data);
        f.rowbytes = world->rowbytes;
        f.w = world->width;
        f.h = world->height;
        f.deep = PF_WORLD_IS_DEEP(world) != 0;
    }
    return f;
}

inline float unpremul(float c, float a) { return a > 0 ? std::min(c / a, 1.0f) : 0.0f; }

void store(const ptp::RGBA &c, PF_EffectWorld *out, int x, int y, bool deep) {
    float a = std::min(std::max(c.a, 0.0f), 1.0f);
    char *row = reinterpret_cast<char *>(out->data) + (size_t)y * out->rowbytes;
    if (deep) {
        PF_Pixel16 *p = reinterpret_cast<PF_Pixel16 *>(row) + x;
        p->alpha = (A_u_short)(a * PF_MAX_CHAN16 + 0.5f);
        p->red = (A_u_short)(unpremul(c.r, a) * PF_MAX_CHAN16 + 0.5f);
        p->green = (A_u_short)(unpremul(c.g, a) * PF_MAX_CHAN16 + 0.5f);
        p->blue = (A_u_short)(unpremul(c.b, a) * PF_MAX_CHAN16 + 0.5f);
    } else {
        PF_Pixel8 *p = reinterpret_cast<PF_Pixel8 *>(row) + x;
        p->alpha = (A_u_char)(a * 255 + 0.5f);
        p->red = (A_u_char)(unpremul(c.r, a) * 255 + 0.5f);
        p->green = (A_u_char)(unpremul(c.g, a) * 255 + 0.5f);
        p->blue = (A_u_char)(unpremul(c.b, a) * 255 + 0.5f);
    }
}

// ---- Parameters ------------------------------------------------------------

float angle(PF_ParamDef *p) { return (float)FIX_2_FLOAT(p->u.ad.value); }
float slider(PF_ParamDef *p) { return (float)p->u.fs_d.value; }

// Reads every parameter into core Params. Pixel distances are scaled by the
// current downsample so a half-resolution preview matches the full render.
ptp::Params readParams(PF_InData *in_data, PF_ParamDef *params[]) {
    ptp::Params p;
    float ds = (float)in_data->downsample_x.num / (float)std::max<A_long>((A_long)in_data->downsample_x.den, 1);

    p.progress = slider(params[PTP_PROGRESS]) / 100.0f;
    p.corner = params[PTP_CORNER]->u.pd.value - 1;
    p.vertical = params[PTP_DIRECTION]->u.pd.value == 2;
    p.tiltDeg = angle(params[PTP_TILT]);
    p.tiltRecovery = slider(params[PTP_TILT_RECOVERY]) / 100.0f;
    p.ease = slider(params[PTP_EASE]) / 100.0f;
    p.overshoot = slider(params[PTP_OVERSHOOT]) / 100.0f;

    p.radius = slider(params[PTP_RADIUS]) * ds;
    p.bulge = slider(params[PTP_BULGE]) * ds;
    p.cone = slider(params[PTP_CONE]) / 100.0f;
    p.bend = slider(params[PTP_BEND]) / 100.0f;

    p.lightAngleDeg = angle(params[PTP_LIGHT_ANGLE]);
    p.lightHeightDeg = slider(params[PTP_LIGHT_HEIGHT]);
    p.ambient = slider(params[PTP_AMBIENT]) / 100.0f;
    p.specular = slider(params[PTP_SPECULAR]) / 100.0f;
    p.shininess = slider(params[PTP_SHININESS]);

    PF_Pixel sc = params[PTP_SHADOW_COLOR]->u.cd.value;
    p.shadowColor[0] = sc.red / 255.0f;
    p.shadowColor[1] = sc.green / 255.0f;
    p.shadowColor[2] = sc.blue / 255.0f;
    p.shadowOpacity = slider(params[PTP_SHADOW_OPACITY]) / 100.0f;
    p.shadowAngleDeg = angle(params[PTP_SHADOW_ANGLE]);
    p.shadowDistance = slider(params[PTP_SHADOW_DISTANCE]) * ds;
    p.shadowSoftness = slider(params[PTP_SHADOW_SOFTNESS]) * ds;
    p.contact = slider(params[PTP_CONTACT]) / 100.0f;
    p.shadowMask = params[PTP_SHADOW_MASK]->u.pd.value == 2 ? ptp::ShadowOnEverything : ptp::ShadowOnPage;

    p.backOpacity = slider(params[PTP_BACK_OPACITY]) / 100.0f;
    PF_Pixel pc = params[PTP_PAPER_COLOR]->u.cd.value;
    p.paper[0] = pc.red / 255.0f;
    p.paper[1] = pc.green / 255.0f;
    p.paper[2] = pc.blue / 255.0f;
    p.backMirror = params[PTP_BACK_MIRROR]->u.pd.value - 1;
    p.backOffset[0] = slider(params[PTP_BACK_OFFSET_X]) * ds;
    p.backOffset[1] = slider(params[PTP_BACK_OFFSET_Y]) * ds;
    p.backScale = slider(params[PTP_BACK_SCALE]) / 100.0f;
    p.backRotDeg = angle(params[PTP_BACK_ROTATION]);

    p.render = params[PTP_RENDER]->u.pd.value - 1;
    int q = params[PTP_QUALITY]->u.pd.value;
    p.supersample = q == 1 ? 1 : (q == 2 ? 2 : 3);
    return p;
}

// ---- Commands --------------------------------------------------------------

PF_Err About(PF_InData *in_data, PF_OutData *out_data) {
    PF_SPRINTF(out_data->return_msg, "%s v%d.%d\r%s", PTP_NAME, PTP_MAJOR_VERSION, PTP_MINOR_VERSION,
               PTP_DESCRIPTION);
    return PF_Err_NONE;
}

PF_Err GlobalSetup(PF_OutData *out_data) {
    out_data->my_version =
        PF_VERSION(PTP_MAJOR_VERSION, PTP_MINOR_VERSION, PTP_BUG_VERSION, PTP_STAGE_VERSION, PTP_BUILD_VERSION);
    // Keep in sync with AE_Effect_Global_OutFlags(_2) in PageTurnProPiPL.r.
    out_data->out_flags = PF_OutFlag_DEEP_COLOR_AWARE | PF_OutFlag_I_EXPAND_BUFFER;
    out_data->out_flags2 = PF_OutFlag2_SUPPORTS_THREADED_RENDERING;
    return PF_Err_NONE;
}

PF_Err ParamsSetup(PF_InData *in_data, PF_OutData *out_data) {
    PF_Err err = PF_Err_NONE;
    PF_ParamDef def;

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Turn", ID_TURN_TOPIC);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Progress", 0, 100, 0, 100, 0, PF_Precision_TENTHS, PF_ValueDisplayFlag_PERCENT, 0, ID_PROGRESS);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Start Corner", 4, 4, "Top Left|Top Right|Bottom Left|Bottom Right", ID_CORNER);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Turn Direction", 2, 1, "Sideways (Book)|Up/Down (Calendar)", ID_DIRECTION);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Corner Tilt", 20, ID_TILT);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Tilt Recovery", 0, 100, 0, 100, 100, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_TILT_RECOVERY);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Ease", 0, 100, 0, 100, 60, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_EASE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Overshoot", 0, 100, 0, 100, 0, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_OVERSHOOT);
    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ID_TURN_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Curl", ID_CURL_TOPIC);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Radius", 1, 2000, 1, 200, 30, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_RADIUS);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Mid-Turn Bulge", 0, 2000, 0, 300, 60, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_BULGE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Cone", -90, 300, -90, 200, 50, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_CONE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Fold Bend", -100, 100, -100, 100, 0, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_BEND);
    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ID_CURL_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Lighting", ID_LIGHT_TOPIC);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Light Direction", -45, ID_LIGHT_ANGLE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Light Height", 5, 90, 5, 90, 45, PF_Precision_INTEGER, PF_ValueDisplayFlag_NONE, 0, ID_LIGHT_HEIGHT);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Ambient", 0, 100, 0, 100, 35, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_AMBIENT);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Specular", 0, 200, 0, 100, 35, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_SPECULAR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Shininess", 1, 200, 1, 100, 24, PF_Precision_INTEGER, PF_ValueDisplayFlag_NONE, 0, ID_SHININESS);
    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ID_LIGHT_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Shadow", ID_SHADOW_TOPIC);
    AEFX_CLR_STRUCT(def);
    PF_ADD_COLOR("Shadow Color", 0, 0, 0, ID_SHADOW_COLOR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Shadow Opacity", 0, 100, 0, 100, 50, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_SHADOW_OPACITY);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Shadow Direction", 135, ID_SHADOW_ANGLE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Shadow Distance", 0, 1000, 0, 100, 18, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_SHADOW_DISTANCE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Shadow Softness", 0, 500, 0, 100, 24, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_SHADOW_SOFTNESS);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Contact Shadow", 0, 100, 0, 100, 45, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_CONTACT);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Shadow On", 2, 1, "Page Only|Page and Layers Below", ID_SHADOW_MASK);
    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ID_SHADOW_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Back Page", ID_BACK_TOPIC);
    AEFX_CLR_STRUCT(def);
    PF_ADD_LAYER("Back Layer", PF_LayerDefault_NONE, ID_BACK_LAYER);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Back Opacity", 0, 100, 0, 100, 100, PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, ID_BACK_OPACITY);
    AEFX_CLR_STRUCT(def);
    PF_ADD_COLOR("Paper Color", 237, 235, 224, ID_PAPER_COLOR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Back Mirror", 4, 1, "Auto|None|Horizontal|Vertical", ID_BACK_MIRROR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Back Offset X", -10000, 10000, -500, 500, 0, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_BACK_OFFSET_X);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Back Offset Y", -10000, 10000, -500, 500, 0, PF_Precision_TENTHS, PF_ValueDisplayFlag_NONE, 0, ID_BACK_OFFSET_Y);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Back Scale", 1, 1000, 10, 300, 100, PF_Precision_TENTHS, PF_ValueDisplayFlag_PERCENT, 0, ID_BACK_SCALE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Back Rotation", 0, ID_BACK_ROTATION);
    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ID_BACK_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Render", 5, 1, "Full|No Shadow|Turned Part Only|Shadow Only|Front Page Only", ID_RENDER);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Quality", 3, 2, "Draft|Normal (2x2 AA)|High (3x3 AA)", ID_QUALITY);

    out_data->num_params = PTP_NUM_PARAMS;
    return err;
}

// Grows the output buffer so the flap and shadow are not clipped to the layer.
PF_Err FrameSetup(PF_InData *in_data, PF_OutData *out_data, PF_ParamDef *params[]) {
    const PF_LayerDef &in = params[PTP_INPUT]->u.ld;
    ptp::Params p = readParams(in_data, params);
    ptp::Geometry g(p, (float)in.width, (float)in.height);
    ptp::Rect b = g.bounds();

    const float limit = 30000.0f; // AE's maximum layer size
    A_long left = (A_long)std::floor(std::max(b.left, -limit));
    A_long top = (A_long)std::floor(std::max(b.top, -limit));
    A_long right = (A_long)std::ceil(std::min(b.right, (float)in.width + limit));
    A_long bottom = (A_long)std::ceil(std::min(b.bottom, (float)in.height + limit));
    left = std::min<A_long>(left, 0);
    top = std::min<A_long>(top, 0);
    right = std::max<A_long>(right, in.width);
    bottom = std::max<A_long>(bottom, in.height);

    out_data->width = right - left;
    out_data->height = bottom - top;
    out_data->origin.h = (A_short)(-left);
    out_data->origin.v = (A_short)(-top);
    return PF_Err_NONE;
}

typedef ptp::Renderer<WorldFetch, WorldFetch> Renderer;

struct RowJob {
    const Renderer *renderer;
    PF_EffectWorld *output;
    A_long originX, originY;
    bool deep;
};

PF_Err RenderRow(void *refcon, A_long /*thread*/, A_long y, A_long /*rows*/) {
    const RowJob *job = static_cast<const RowJob *>(refcon);
    float ly = (float)(y - job->originY) + 0.5f;
    for (A_long x = 0; x < job->output->width; x++) {
        float lx = (float)(x - job->originX) + 0.5f;
        store(job->renderer->pixel(lx, ly), job->output, (int)x, (int)y, job->deep);
    }
    return PF_Err_NONE;
}

PF_Err Render(PF_InData *in_data, PF_OutData * /*out_data*/, PF_ParamDef *params[], PF_LayerDef *output) {
    PF_Err err = PF_Err_NONE;
    ptp::Params p = readParams(in_data, params);

    PF_ParamDef backParam;
    AEFX_CLR_STRUCT(backParam);
    ERR(PF_CHECKOUT_PARAM(in_data, PTP_BACK_LAYER, in_data->current_time, in_data->time_step, in_data->time_scale,
                          &backParam));
    if (err) return err;

    ptp::Sampler<WorldFetch> src;
    src.fetch = fetchFor(&params[PTP_INPUT]->u.ld);
    src.w = src.fetch.w;
    src.h = src.fetch.h;

    ptp::Sampler<WorldFetch> back;
    back.fetch = fetchFor(&backParam.u.ld);
    back.w = back.fetch.w;
    back.h = back.fetch.h;

    Renderer renderer(p, src, back.fetch.base ? &back : nullptr);
    RowJob job = {&renderer, output, in_data->output_origin_x, in_data->output_origin_y,
                  PF_WORLD_IS_DEEP(output) != 0};
    ERR(in_data->utils->iterate_generic(output->height, &job, RenderRow));

    PF_Err err2 = PF_CHECKIN_PARAM(in_data, &backParam);
    return err ? err : err2;
}

} // namespace

extern "C" DllExport PF_Err PluginDataEntryFunction2(PF_PluginDataPtr inPtr, PF_PluginDataCB2 inPluginDataCallBackPtr,
                                                     SPBasicSuite * /*inSPBasicSuitePtr*/,
                                                     const char * /*inHostName*/, const char * /*inHostVersion*/) {
    // PF_REGISTER_EFFECT_EXT2 expands to code that assigns to a local named `result`.
    PF_Err result = PF_Err_INVALID_CALLBACK;
    result = PF_REGISTER_EFFECT_EXT2(inPtr, inPluginDataCallBackPtr, PTP_NAME, PTP_MATCH_NAME, PTP_CATEGORY,
                                     AE_RESERVED_INFO, "EffectMain", "https://github.com/bstnys/ae-mcp");
    return result;
}

PF_Err EffectMain(PF_Cmd cmd, PF_InData *in_data, PF_OutData *out_data, PF_ParamDef *params[], PF_LayerDef *output,
                  void * /*extra*/) {
    PF_Err err = PF_Err_NONE;
    try {
        switch (cmd) {
        case PF_Cmd_ABOUT: err = About(in_data, out_data); break;
        case PF_Cmd_GLOBAL_SETUP: err = GlobalSetup(out_data); break;
        case PF_Cmd_PARAMS_SETUP: err = ParamsSetup(in_data, out_data); break;
        case PF_Cmd_FRAME_SETUP: err = FrameSetup(in_data, out_data, params); break;
        case PF_Cmd_RENDER: err = Render(in_data, out_data, params, output); break;
        default: break;
        }
    } catch (...) {
        err = PF_Err_INTERNAL_STRUCT_DAMAGED;
    }
    return err;
}
