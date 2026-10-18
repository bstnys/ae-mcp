// Minimal fake After Effects host: loads PageTurnPro.aex the way AE does (PiPL, plugin data
// entry, ABOUT, GLOBAL_SETUP, PARAMS_SETUP, FRAME_SETUP, RENDER) and writes the frame as PPM.
// Build with MinGW against the SDK and run under Wine or on Windows:
//   win_host.exe PageTurnPro.aex out.ppm
#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "AE_PluginData.h"
#include "AE_EffectVers.h"
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <vector>
#include <cstring>

static std::vector<PF_ParamDef> defs;
static PF_Err add_param(PF_ProgPtr, PF_ParamIndex, PF_ParamDefPtr def) { defs.push_back(*def); return 0; }
static PF_Err checkout(PF_ProgPtr, PF_ParamIndex idx, A_long, A_long, A_u_long, PF_ParamDef *p) {
    std::memset(p, 0, sizeof(*p)); p->param_type = PF_Param_LAYER; return 0; }
static PF_Err checkin(PF_ProgPtr, PF_ParamDef *) { return 0; }
static PF_Err iterate_generic(A_long n, void *refcon, PF_Err (*fn)(void *, A_long, A_long, A_long)) {
    for (A_long i = 0; i < n; i++) { PF_Err e = fn(refcon, 0, i, n); if (e) return e; } return 0; }
static A_long my_sprintf(A_char *buf, const A_char *fmt, ...) { va_list a; va_start(a, fmt); int n = vsprintf(buf, fmt, a); va_end(a); return n; }

static int nreg;
static PF_Err reg_cb(PF_PluginDataPtr, const A_u_char *name, const A_u_char *match, const A_u_char *cat,
                     const A_u_char *entry, A_long kind, A_long apiMaj, A_long apiMin, A_long reserved, const A_u_char *url) {
    printf("register: name=%s match=%s cat=%s entry=%s url=%s api=%ld.%ld\n", name, match, cat, entry, url, (long)apiMaj, (long)apiMin);
    nreg++; return 0;
}

int main(int argc, char **argv) {
    HMODULE h = LoadLibraryA(argv[1]);
    if (!h) { printf("LoadLibrary failed %lu\n", GetLastError()); return 1; }
    HRSRC r = FindResourceA(h, MAKEINTRESOURCEA(16000), "PiPL");
    printf("PiPL resource: %s, %lu bytes\n", r ? "found" : "MISSING", r ? SizeofResource(h, r) : 0);
    auto entry = (PF_Err(*)(PF_Cmd, PF_InData *, PF_OutData *, PF_ParamDef *[], PF_LayerDef *, void *))GetProcAddress(h, "EffectMain");
    auto pde = (PF_Err(*)(PF_PluginDataPtr, PF_PluginDataCB2, SPBasicSuite *, const char *, const char *))GetProcAddress(h, "PluginDataEntryFunction2");
    printf("EffectMain %p, PluginDataEntryFunction2 %p\n", (void *)entry, (void *)pde);
    if (!entry || !pde) return 1;
    printf("PluginDataEntryFunction2 -> %d (%d registered)\n", (int)pde((PF_PluginDataPtr)1, reg_cb, nullptr, "AE", "26.5"), nreg);

    PF_UtilCallbacks utils; std::memset(&utils, 0, sizeof(utils));
    utils.iterate_generic = iterate_generic; utils.ansi.sprintf = my_sprintf;
    PF_InData in; std::memset(&in, 0, sizeof(in));
    in.utils = &utils; in.inter.add_param = add_param; in.inter.checkout_param = checkout; in.inter.checkin_param = checkin;
    in.version.major = PF_PLUG_IN_VERSION; in.version.minor = PF_PLUG_IN_SUBVERS;
    in.downsample_x.num = in.downsample_x.den = in.downsample_y.num = in.downsample_y.den = 1;
    PF_OutData out; std::memset(&out, 0, sizeof(out));

    PF_Err e = entry(PF_Cmd_ABOUT, &in, &out, nullptr, nullptr, nullptr);
    printf("ABOUT -> %d: %s\n", (int)e, out.return_msg);
    e = entry(PF_Cmd_GLOBAL_SETUP, &in, &out, nullptr, nullptr, nullptr);
    printf("GLOBAL_SETUP -> %d: version=0x%lx out_flags=0x%lx out_flags2=0x%lx\n", (int)e, (unsigned long)out.my_version,
           (unsigned long)out.out_flags, (unsigned long)out.out_flags2);
    PF_ParamDef input; std::memset(&input, 0, sizeof(input)); defs.push_back(input);
    e = entry(PF_Cmd_PARAMS_SETUP, &in, &out, nullptr, nullptr, nullptr);
    printf("PARAMS_SETUP -> %d: %zu params added (+input), num_params=%ld\n", (int)e, defs.size() - 1, (long)out.num_params);

    // Input layer: 400x500 8-bit checkerboard.
    const int W = 400, H = 500;
    std::vector<PF_Pixel8> src(W * H);
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
        A_u_char c = ((x / 40 + y / 40) & 1) ? 200 : 240; src[y * W + x] = {255, c, c, (A_u_char)(c - 20)}; }
    PF_LayerDef &ld = defs[0].u.ld; ld.data = src.data(); ld.width = W; ld.height = H; ld.rowbytes = W * 4;
    std::vector<PF_ParamDef *> pp; for (auto &d : defs) pp.push_back(&d);
    // Turn 35% from the top left, as in the user's test comp.
    pp[2]->u.fs_d.value = 35; pp[3]->u.pd.value = 1; pp[4]->u.pd.value = 2; pp[11]->u.fs_d.value = 86;

    e = entry(PF_Cmd_FRAME_SETUP, &in, &out, pp.data(), nullptr, nullptr);
    printf("FRAME_SETUP -> %d: output %ldx%ld origin %d,%d\n", (int)e, (long)out.width, (long)out.height, out.origin.h, out.origin.v);
    int OW = out.width, OH = out.height;
    std::vector<PF_Pixel8> dst(OW * OH);
    PF_LayerDef o; std::memset(&o, 0, sizeof(o)); o.data = dst.data(); o.width = OW; o.height = OH; o.rowbytes = OW * 4;
    in.output_origin_x = out.origin.h; in.output_origin_y = out.origin.v;
    e = entry(PF_Cmd_RENDER, &in, &out, pp.data(), &o, nullptr);
    printf("RENDER -> %d\n", (int)e);
    FILE *f = fopen(argv[2], "wb"); fprintf(f, "P6 %d %d 255\n", OW, OH);
    for (auto &p : dst) { float a = p.alpha / 255.f; unsigned char c[3] = {(unsigned char)(p.red * a + 90 * (1 - a)), (unsigned char)(p.green * a + 90 * (1 - a)), (unsigned char)(p.blue * a + 90 * (1 - a))}; fwrite(c, 1, 3, f); }
    fclose(f);
    return e;
}
