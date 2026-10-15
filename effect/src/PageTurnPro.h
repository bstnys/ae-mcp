#pragma once

#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AE_EffectCBSuites.h"

#define PTP_NAME        "Page Turn Pro"
#define PTP_MATCH_NAME  "BSTNYS Page Turn Pro"
#define PTP_CATEGORY    "Distort"
#define PTP_DESCRIPTION "Page turn with eased progress, cone curl, real lighting, cast shadow and back page mapping."

#define PTP_MAJOR_VERSION 0
#define PTP_MINOR_VERSION 1
#define PTP_BUG_VERSION   0
#define PTP_STAGE_VERSION PF_Stage_DEVELOP
#define PTP_BUILD_VERSION 1

// Parameter order. Disk IDs below must never change once projects use the effect.
enum {
    PTP_INPUT = 0,

    PTP_TURN_TOPIC,
    PTP_PROGRESS,
    PTP_CORNER,
    PTP_DIRECTION,
    PTP_TILT,
    PTP_TILT_RECOVERY,
    PTP_EASE,
    PTP_OVERSHOOT,
    PTP_TURN_END,

    PTP_CURL_TOPIC,
    PTP_RADIUS,
    PTP_BULGE,
    PTP_CONE,
    PTP_BEND,
    PTP_CURL_END,

    PTP_LIGHT_TOPIC,
    PTP_LIGHT_ANGLE,
    PTP_LIGHT_HEIGHT,
    PTP_AMBIENT,
    PTP_SPECULAR,
    PTP_SHININESS,
    PTP_LIGHT_END,

    PTP_SHADOW_TOPIC,
    PTP_SHADOW_COLOR,
    PTP_SHADOW_OPACITY,
    PTP_SHADOW_ANGLE,
    PTP_SHADOW_DISTANCE,
    PTP_SHADOW_SOFTNESS,
    PTP_CONTACT,
    PTP_SHADOW_END,

    PTP_BACK_TOPIC,
    PTP_BACK_LAYER,
    PTP_BACK_OPACITY,
    PTP_PAPER_COLOR,
    PTP_BACK_MIRROR,
    PTP_BACK_OFFSET_X,
    PTP_BACK_OFFSET_Y,
    PTP_BACK_SCALE,
    PTP_BACK_ROTATION,
    PTP_BACK_END,

    PTP_RENDER,
    PTP_QUALITY,

    PTP_NUM_PARAMS
};

enum {
    ID_TURN_TOPIC = 1,
    ID_PROGRESS,
    ID_CORNER,
    ID_DIRECTION,
    ID_TILT,
    ID_TILT_RECOVERY,
    ID_EASE,
    ID_OVERSHOOT,
    ID_TURN_END,
    ID_CURL_TOPIC,
    ID_RADIUS,
    ID_BULGE,
    ID_CONE,
    ID_BEND,
    ID_CURL_END,
    ID_LIGHT_TOPIC,
    ID_LIGHT_ANGLE,
    ID_LIGHT_HEIGHT,
    ID_AMBIENT,
    ID_SPECULAR,
    ID_SHININESS,
    ID_LIGHT_END,
    ID_SHADOW_TOPIC,
    ID_SHADOW_COLOR,
    ID_SHADOW_OPACITY,
    ID_SHADOW_ANGLE,
    ID_SHADOW_DISTANCE,
    ID_SHADOW_SOFTNESS,
    ID_CONTACT,
    ID_SHADOW_END,
    ID_BACK_TOPIC,
    ID_BACK_LAYER,
    ID_BACK_OPACITY,
    ID_PAPER_COLOR,
    ID_BACK_MIRROR,
    ID_BACK_OFFSET_X,
    ID_BACK_OFFSET_Y,
    ID_BACK_SCALE,
    ID_BACK_ROTATION,
    ID_BACK_END,
    ID_RENDER,
    ID_QUALITY
};

extern "C" {
DllExport PF_Err EffectMain(PF_Cmd cmd, PF_InData *in_data, PF_OutData *out_data, PF_ParamDef *params[],
                            PF_LayerDef *output, void *extra);
}
