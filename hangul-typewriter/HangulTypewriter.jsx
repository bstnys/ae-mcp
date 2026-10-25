// Hangul Typewriter - ScriptUI panel for After Effects.
// build.js turns this template into ../HangulTypewriter.jsx (pure ASCII, expression inlined).
// Window > HangulTypewriter.jsx when installed in Scripts/ScriptUI Panels, or File > Scripts > Run Script File.
(function (thisObj) {
  var EXPRESSION = "// \ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130 \u2014 Source Text expression.\n// \ud55c\uae00\uc744 \ub450\ubc8c\uc2dd \uc790\ud310\uc73c\ub85c \uce58\ub294 \uac83\ucc98\ub7fc \uc790\ubaa8 \ub2e8\uc704\ub85c \uc870\ub9bd\ud574 \ubcf4\uc5ec \uc900\ub2e4 (\u3131 \u2192 \uac00 \u2192 \uac01, \u3131 \u2192 \uac00 \u2192 \uac04 \u2192 \uac00\ub098).\n// HangulTypewriter.jsx\uac00 \uc774 \ud30c\uc77c\uc744 \uadf8\ub300\ub85c \ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\uc758 Source Text\uc5d0 \ub123\ub294\ub2e4. build.js\ub85c \ub2e4\uc2dc \ub9cc\ub4e0\ub2e4.\n// \ub808\uac70\uc2dc ExtendScript \uc5d4\uc9c4\uc5d0\uc11c\ub3c4 \ub3cc\ub3c4\ub85d ES3 \ubb38\ubc95\ub9cc \uc4f4\ub2e4.\nvar P = \"\ud55c\uae00 \ud0c0\uc790 \u00b7 \";\nfunction ctl(n, d) { try { return effect(P + n)(1).value; } catch (e) { return d; } }\n\nvar speed = Math.max(ctl(\"\uc18d\ub3c4 (\ud0c0/\ucd08)\", 12), 0.01);\nvar start = ctl(\"\uc2dc\uc791 \uc2dc\uac04 (\ucd08)\", 0);\nvar jitter = Math.min(Math.max(ctl(\"\ub9ac\ub4ec \ud754\ub4e4\ub9bc (%)\", 30), 0), 100) / 100;\nvar punctPause = Math.max(ctl(\"\ubb38\uc7a5\ubd80\ud638 \ub4a4 \uc27c (\ucd08)\", 0.3), 0);\nvar jamo = ctl(\"\uc790\ubaa8 \uc870\ud569\", 1) == 1;\nvar ghost = ctl(\"\ub3c4\uae68\ube44\ubd88\", 1) == 1;\nvar manual = ctl(\"\uc218\ub3d9 \uc9c4\ud589\", 0) == 1;\nvar cursorOn = ctl(\"\ucee4\uc11c \ud45c\uc2dc\", 1) == 1;\nvar cursorShape = ctl(\"\ucee4\uc11c \ubaa8\uc591\", 1);\nvar blink = Math.max(ctl(\"\ucee4\uc11c \uae5c\ube61\uc784 (\ud68c/\ucd08)\", 2), 0);\nvar cursorHide = ctl(\"\uc644\ub8cc \ud6c4 \ucee4\uc11c \uc228\uae40 (\ucd08, 0=\uacc4\uc18d)\", 0);\n\n// \ucd08\uc131 \u2192 \uc885\uc131 \ubc88\ud638, \ucd08\uc131 \u2192 \ud638\ud658 \uc790\ubaa8, \uacb9\ubaa8\uc74c/\uacb9\ubc1b\uce68\uc758 \uccab \ud0c0, \ubc1b\uce68 + \ucd08\uc131 \u2192 \uacb9\ubc1b\uce68\nvar LT = [1, 2, 4, 7, 0, 8, 16, 17, 0, 19, 20, 21, 22, 0, 23, 24, 25, 26, 27];\nvar CL = [0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145,\n  0x3146, 0x3147, 0x3148, 0x3149, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E];\nvar VS = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };\nvar TS = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };\nvar TC = { \"1_9\": 3, \"4_12\": 5, \"4_18\": 6, \"8_0\": 9, \"8_6\": 10, \"8_7\": 11, \"8_9\": 12,\n  \"8_16\": 13, \"8_17\": 14, \"8_18\": 15, \"17_9\": 18 };\n\nfunction syl(l, v, t) { return String.fromCharCode(0xAC00 + (l * 21 + v) * 28 + t); }\nfunction info(ch) {\n  var c = ch.charCodeAt(0) - 0xAC00;\n  if (ch.length != 1 || c < 0 || c > 11171) return null;\n  return { l: Math.floor(c / 588), v: Math.floor((c % 588) / 28), t: c % 28 };\n}\nfunction strokes(ch) {\n  var h = info(ch);\n  if (!h || !jamo) return 1;\n  return 2 + (VS[h.v] !== undefined ? 1 : 0) + (h.t ? 1 + (TS[h.t] !== undefined ? 1 : 0) : 0);\n}\n// ch\ub97c j\ud0c0(1 <= j < strokes(ch))\uae4c\uc9c0 \ucce4\uc744 \ub54c \ubcf4\uc774\ub294 \uae00\uc790\nfunction partial(ch, j) {\n  var h = info(ch);\n  if (j == 1) return String.fromCharCode(CL[h.l]);\n  var vc = VS[h.v] !== undefined;\n  if (j == 2) return syl(h.l, vc ? VS[h.v] : h.v, 0);\n  if (vc && j == 3) return syl(h.l, h.v, 0);\n  return syl(h.l, h.v, TS[h.t] !== undefined ? TS[h.t] : h.t);\n}\nfunction isPause(ch) { return \".,!?\u2026;:\u3002\u3001\\r\\n\".indexOf(ch) >= 0; }\n\nvar src = (value && value.text !== undefined) ? value.text : String(value);\nvar chars = [], counts = [], N = 0, i, c;\nfor (i = 0; i < src.length; i++) {\n  c = src.charAt(i);\n  var cc = src.charCodeAt(i);\n  if (cc >= 0xD800 && cc <= 0xDBFF && i + 1 < src.length) { c += src.charAt(i + 1); i++; }\n  chars.push(c);\n  counts.push(strokes(c));\n  N += counts[counts.length - 1];\n}\n\n// \uc9c0\uae08\uae4c\uc9c0 \uce5c \ud0c0\uc218\nvar shown = 0, typing = false, sinceLast = -1;\nif (manual) {\n  var prog = effect(P + \"\uc9c4\ud589 (%)\")(1);\n  var p = Math.min(Math.max(prog.value, 0), 100);\n  shown = Math.round(p / 100 * N);\n  typing = Math.abs(p - prog.valueAtTime(time - thisComp.frameDuration)) > 0.0001 && shown < N;\n  sinceLast = shown > 0 ? 0 : -1;\n  if (shown >= N && N > 0) {\n    // 100%\uc5d0 \ucc98\uc74c \ub2ff\uc740 \ub4a4 \uc9c0\ub09c \uc2dc\uac04 (\ucee4\uc11c \uc228\uae40\uc6a9)\n    var f = thisComp.frameDuration, back = 0;\n    while (back < 600 && prog.valueAtTime(time - (back + 1) * f) >= 100) back++;\n    sinceLast = back * f;\n  }\n} else {\n  var el = time - inPoint - start, base = 1 / speed, t = 0, ci = 0, cj = 0;\n  while (shown < N && t <= el) {\n    shown++;\n    sinceLast = el - t;\n    var pause = 0;\n    cj++;\n    if (cj >= counts[ci]) { if (isPause(chars[ci])) pause = punctPause; ci++; cj = 0; }\n    seedRandom(shown, true);\n    t += base * (1 + jitter * (random() * 2 - 1)) + pause;\n  }\n  typing = shown > 0 && shown < N;\n}\n\n// \ud654\uba74\uc5d0 \ubcf4\uc77c \uae00\uc790\nvar rem = shown, k = 0;\nwhile (k < chars.length && rem >= counts[k]) { rem -= counts[k]; k++; }\nvar out = chars.slice(0, k).join(\"\");\nif (rem > 0) {\n  var h = info(chars[k]), pv = k > 0 ? info(chars[k - 1]) : null, nt = 0;\n  if (rem == 1 && ghost && pv) nt = pv.t == 0 ? LT[h.l] : (TC[pv.t + \"_\" + h.l] || 0);\n  if (nt) out = out.substring(0, out.length - 1) + syl(pv.l, pv.v, nt);\n  else out += partial(chars[k], rem);\n}\n\nif (cursorOn) {\n  var shapes = [\"|\", \"_\", \"\u258c\", \"\u258f\"];\n  var cur = shapes[Math.max(1, Math.min(shapes.length, Math.round(cursorShape))) - 1];\n  var done = N > 0 && shown >= N;\n  var visible = typing || blink == 0 || Math.floor(time * blink * 2) % 2 == 0;\n  if (done && cursorHide > 0 && sinceLast >= cursorHide) visible = false;\n  if (visible) out += cur;\n}\nout;\n";
  var P = "\ud55c\uae00 \ud0c0\uc790 \u00b7 ";
  var TAG = "// \ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130";
  var SHAPES = ["|", "_", "\u258c", "\u258f"];

  // [\uc774\ub984, \uc885\ub958, \uae30\ubcf8\uac12]
  var CONTROLS = [
    ["\uc18d\ub3c4 (\ud0c0/\ucd08)", "slider", 12],
    ["\uc2dc\uc791 \uc2dc\uac04 (\ucd08)", "slider", 0],
    ["\ub9ac\ub4ec \ud754\ub4e4\ub9bc (%)", "slider", 30],
    ["\ubb38\uc7a5\ubd80\ud638 \ub4a4 \uc27c (\ucd08)", "slider", 0.3],
    ["\uc790\ubaa8 \uc870\ud569", "checkbox", 1],
    ["\ub3c4\uae68\ube44\ubd88", "checkbox", 1],
    ["\uc218\ub3d9 \uc9c4\ud589", "checkbox", 0],
    ["\uc9c4\ud589 (%)", "slider", 0],
    ["\ucee4\uc11c \ud45c\uc2dc", "checkbox", 1],
    ["\ucee4\uc11c \ubaa8\uc591", "dropdown", 1],
    ["\ucee4\uc11c \uae5c\ube61\uc784 (\ud68c/\ucd08)", "slider", 2],
    ["\uc644\ub8cc \ud6c4 \ucee4\uc11c \uc228\uae40 (\ucd08, 0=\uacc4\uc18d)", "slider", 0]
  ];
  var MATCH = { slider: "ADBE Slider Control", checkbox: "ADBE Checkbox Control", dropdown: "ADBE Dropdown Control" };

  function textLayers() {
    var comp = app.project && app.project.activeItem;
    if (!(comp instanceof CompItem)) return null;
    var out = [], sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) out.push(sel[i]);
    return out;
  }

  function addControl(layer, def, overrides) {
    var fx = layer.property("ADBE Effect Parade");
    var name = P + def[0];
    var existing = fx.property(name);
    if (existing) return;
    var kind = def[1], value = overrides.hasOwnProperty(def[0]) ? overrides[def[0]] : def[2];
    var eff = null;
    if (kind == "dropdown") {
      try {
        eff = fx.addProperty(MATCH.dropdown);
        eff.name = name;
        eff.property(1).setPropertyParameters(SHAPES);
        eff = fx.property(name);
      } catch (e) {
        if (eff) try { eff.remove(); } catch (e2) {}
        eff = null;
        kind = "slider"; // \ub4dc\ub86d\ub2e4\uc6b4\uc774 \uc5c6\ub294 AE \ubc84\uc804: 1~4 \uc22b\uc790\ub85c
      }
    }
    if (!eff) {
      eff = fx.addProperty(MATCH[kind]);
      eff.name = name;
    }
    eff.property(1).setValue(value);
  }

  function apply(overrides) {
    var layers = textLayers();
    if (!layers) return alert("\ucef4\ud3ec\uc9c0\uc158\uc744 \uc5f4\uace0 \ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\ub97c \uc120\ud0dd\ud558\uc138\uc694.");
    if (!layers.length) return alert("\ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\ub97c \ud558\ub098 \uc774\uc0c1 \uc120\ud0dd\ud558\uc138\uc694.");
    app.beginUndoGroup("\ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130 \uc801\uc6a9");
    try {
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        for (var c = 0; c < CONTROLS.length; c++) addControl(L, CONTROLS[c], overrides);
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        st.expression = TAG + "\n" + EXPRESSION;
        st.expressionEnabled = true;
        if (st.expressionError) alert(L.name + ": " + st.expressionError);
      }
    } finally {
      app.endUndoGroup();
    }
  }

  function remove() {
    var layers = textLayers();
    if (!layers || !layers.length) return alert("\ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\ub97c \uc120\ud0dd\ud558\uc138\uc694.");
    app.beginUndoGroup("\ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130 \uc81c\uac70");
    try {
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        if (st.expression.indexOf(TAG) == 0) st.expression = "";
        var fx = L.property("ADBE Effect Parade");
        for (var k = fx.numProperties; k >= 1; k--) {
          if (fx.property(k).name.indexOf(P) == 0) fx.property(k).remove();
        }
      }
    } finally {
      app.endUndoGroup();
    }
  }

  function bake() {
    var layers = textLayers();
    if (!layers || !layers.length) return alert("\ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\ub97c \uc120\ud0dd\ud558\uc138\uc694.");
    app.beginUndoGroup("\ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130 \ud0a4\ud504\ub808\uc784\uc73c\ub85c \uad7d\uae30");
    try {
      var comp = app.project.activeItem;
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        if (st.expression.indexOf(TAG) != 0) continue;
        var t0 = Math.max(L.inPoint, 0), t1 = Math.min(L.outPoint, comp.duration);
        var fd = comp.frameDuration, last = null, times = [], vals = [];
        for (var t = t0; t < t1; t += fd) {
          var s = st.valueAtTime(t, false).text;
          if (s !== last) { times.push(t); vals.push(s); last = s; }
        }
        st.expression = "";
        var base = st.value;
        while (st.numKeys) st.removeKey(1);
        for (var k = 0; k < times.length; k++) {
          var doc = base;
          doc.text = vals[k];
          st.setValueAtTime(times[k], doc);
        }
        var fx = L.property("ADBE Effect Parade");
        for (var e = fx.numProperties; e >= 1; e--) {
          if (fx.property(e).name.indexOf(P) == 0) fx.property(e).remove();
        }
      }
    } finally {
      app.endUndoGroup();
    }
  }

  function build(root) {
    var w = (root instanceof Panel) ? root : new Window("palette", "\ud55c\uae00 \ud0c0\uc785\ub77c\uc774\ud130", undefined, { resizeable: true });
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 6;
    w.margins = 10;

    var g = w.add("group");
    g.add("statictext", undefined, "\uc18d\ub3c4 (\ud0c0/\ucd08)");
    var speed = g.add("edittext", undefined, "12");
    speed.characters = 5;

    var cursor = w.add("checkbox", undefined, "\ucee4\uc11c \ud45c\uc2dc");
    cursor.value = true;
    var ghost = w.add("checkbox", undefined, "\ub3c4\uae68\ube44\ubd88 (\uc548 \u2192 \uc544\ub098 \ucc98\ub7fc \ubc1b\uce68\uc774 \ub118\uc5b4\uac10)");
    ghost.value = true;

    var applyBtn = w.add("button", undefined, "\uc120\ud0dd\ud55c \ud14d\uc2a4\ud2b8 \ub808\uc774\uc5b4\uc5d0 \uc801\uc6a9");
    var row = w.add("group");
    row.alignChildren = ["fill", "center"];
    var bakeBtn = row.add("button", undefined, "\ud0a4\ud504\ub808\uc784\uc73c\ub85c \uad7d\uae30");
    var removeBtn = row.add("button", undefined, "\uc81c\uac70");

    var help = w.add("statictext", undefined,
      "\uc801\uc6a9 \ud6c4 \uc774\ud399\ud2b8 \ucee8\ud2b8\ub864\uc758 '\ud55c\uae00 \ud0c0\uc790 \u00b7' \ud56d\ubaa9\uc73c\ub85c \uc18d\ub3c4, \uc2dc\uc791 \uc2dc\uac04, \ucee4\uc11c \ub4f1\uc744 \ubc14\uafc0 \uc218 \uc788\uc5b4\uc694. \ud14d\uc2a4\ud2b8\ub294 \uadf8\ub300\ub85c \uc218\uc815\ud558\uba74 \ub429\ub2c8\ub2e4.",
      { multiline: true });
    help.preferredSize = [220, 60];

    applyBtn.onClick = function () {
      var v = parseFloat(speed.text);
      var o = {};
      if (!isNaN(v) && v > 0) o["\uc18d\ub3c4 (\ud0c0/\ucd08)"] = v;
      o["\ucee4\uc11c \ud45c\uc2dc"] = cursor.value ? 1 : 0;
      o["\ub3c4\uae68\ube44\ubd88"] = ghost.value ? 1 : 0;
      apply(o);
    };
    removeBtn.onClick = remove;
    bakeBtn.onClick = bake;

    w.onResizing = w.onResize = function () { this.layout.resize(); };
    if (w instanceof Window) { w.center(); w.show(); } else { w.layout.layout(true); }
    return w;
  }

  build(thisObj);
})(this);
