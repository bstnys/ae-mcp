#!/usr/bin/env python3
"""Builds the Windows PiPL resource from src/PageTurnProPiPL.r without PiPLtool.

  make_pipl.py PageTurnProPiPL.r AE_EffectVers.h out.pipl [--arch x64|arm64] [--big-endian]

Writes the binary PiPL (little-endian, as After Effects reads it on Windows) and next to
it out.rc, which embeds it as resource PiPL 16000. Only the property kinds used by
PageTurnProPiPL.r are supported. --big-endian with --mac writes the macOS layout, which
must match what Rez produces; check_pipl.py compares the two.
"""
import os
import re
import struct
import sys

# key, vendor, payload kind. OSTypes are written as 32-bit integers, which is why they
# read reversed ("MIB8") in a PiPLtool .rc file.
PROPS = {
    "Kind": ("kind", "8BIM", "ostype"),
    "Name": ("name", "8BIM", "pstring"),
    "Category": ("catg", "8BIM", "pstring"),
    "CodeWin64X86": ("8664", "8BIM", "cstring"),
    "CodeWinARM64": ("wa64", "8BIM", "cstring"),
    "CodeMacIntel64": ("mi64", "8BIM", "cstring"),
    "CodeMacARM64": ("ma64", "8BIM", "cstring"),
    "AE_PiPL_Version": ("ePVR", "8BIM", "shorts"),
    "AE_Effect_Spec_Version": ("eSVR", "8BIM", "shorts"),
    "AE_Effect_Version": ("eVER", "8BIM", "long"),
    "AE_Effect_Info_Flags": ("eINF", "8BIM", "short"),
    "AE_Effect_Global_OutFlags": ("eGLO", "8BIM", "long"),
    "AE_Effect_Global_OutFlags_2": ("eGL2", "8BIM", "long"),
    "AE_Effect_Match_Name": ("eMNA", "8BIM", "pstring"),
    "AE_Reserved_Info": ("aeRD", "8BIM", "long"),
    "AE_Effect_Support_URL": ("eURL", "8BIM", "pstring"),
}
KINDS = {"AEEffect": "eFKT"}


def preprocess(text, defines):
    # Drop comments, leaving string literals (which may contain "//") alone.
    text = re.sub(r'"(?:[^"\\\n]|\\.)*"|/\*.*?\*/|//[^\n]*',
                  lambda g: g.group(0) if g.group(0).startswith('"') else "", text, flags=re.S)
    out, stack = [], []  # stack of (taking, any_branch_taken)
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r"#\s*(ifdef|ifndef|if|elif|else|endif)\b(.*)", s)
        if not m:
            if s.startswith("#"):
                continue
            if all(t for t, _ in stack):
                out.append(line)
            continue
        d, arg = m.group(1), m.group(2).strip()

        def cond(expr):
            expr = re.sub(r"defined\s*\(\s*(\w+)\s*\)", lambda g: str(g.group(1) in defines), expr)
            expr = expr.replace("&&", " and ").replace("||", " or ").replace("!", " not ")
            return bool(eval(expr, {}, {}))

        if d in ("ifdef", "ifndef", "if"):
            c = (arg in defines) if d == "ifdef" else (arg not in defines) if d == "ifndef" else cond(arg)
            stack.append((c, c))
        elif d == "elif":
            _, any_taken = stack.pop()
            c = not any_taken and cond(arg)
            stack.append((c, any_taken or c))
        elif d == "else":
            _, any_taken = stack.pop()
            stack.append((not any_taken, True))
        else:
            stack.pop()
    return "\n".join(out)


def parse_values(body, macros):
    vals = []
    for tok in re.findall(r'"(?:[^"\\]|\\.)*"|[^,\s]+', body):
        if tok.startswith('"'):
            vals.append(bytes(tok[1:-1], "utf-8").decode("unicode_escape").encode("latin-1"))
        elif tok in macros:
            vals.append(macros[tok])
        elif tok in KINDS:
            vals.append(KINDS[tok])
        else:
            vals.append(int(tok, 0))
    return vals


def build(r_text, vers_text, defines, big_endian):
    macros = {}
    for name, val in re.findall(r"#define\s+(PF_PLUG_IN_\w+)\s+(\w+)", vers_text):
        macros[name] = int(val, 0)
    body = preprocess(r_text, defines)
    m = re.search(r"resource\s+'PiPL'\s*\(\s*16000\s*\)\s*\{\s*\{(.*)\}\s*\}\s*;", body, re.S)
    if not m:
        sys.exit("no resource 'PiPL' (16000) found")
    e = ">" if big_endian else "<"

    def ostype(code):
        return struct.pack(e + "I", struct.unpack(">I", code.encode("latin-1"))[0])

    props = []
    for name, inner in re.findall(r"(\w+)\s*\{([^{}]*)\}", m.group(1)):
        if name not in PROPS:
            sys.exit("unsupported PiPL property " + name)
        key, vendor, kind = PROPS[name]
        vals = parse_values(inner, macros)
        if kind == "ostype":
            data = ostype(vals[0])
        elif kind == "pstring":
            data = bytes([len(vals[0])]) + vals[0]
        elif kind == "cstring":
            data = vals[0] + b"\0"
        elif kind == "shorts":
            data = b"".join(struct.pack(e + "h", v) for v in vals)
        elif kind == "short":
            data = struct.pack(e + "h", vals[0])
        else:
            data = struct.pack(e + "I", vals[0] & 0xFFFFFFFF)
        data += b"\0" * (-len(data) % 4)
        props.append(ostype(vendor) + ostype(key) + struct.pack(e + "II", 0, len(data)) + data)
    return struct.pack(e + "hII", 1, 0, len(props)) + b"".join(props)


def main():
    args = sys.argv[1:]
    big = "--big-endian" in args
    arch = "x64"
    if "--arch" in args:
        arch = args[args.index("--arch") + 1]
        del args[args.index("--arch"):args.index("--arch") + 2]
    mac = "--mac" in args
    args = [a for a in args if not a.startswith("--")]
    r_path, vers_path, out_path = args
    if mac:
        defines = {"AE_OS_MAC"}
    else:
        defines = {"AE_OS_WIN", "AE_PROC_INTELx64" if arch == "x64" else "AE_PROC_ARM64"}
    data = build(open(r_path, encoding="latin-1").read(), open(vers_path, encoding="latin-1").read(), defines, big)
    open(out_path, "wb").write(data)
    if not mac:
        rc = out_path.rsplit(".", 1)[0] + ".rc"
        # Absolute path with forward slashes: rc.exe and windres both resolve it.
        open(rc, "w").write("16000 PiPL \"%s\"\n" % os.path.abspath(out_path).replace("\\", "/"))


if __name__ == "__main__":
    main()
