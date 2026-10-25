// Hangul Typewriter - ScriptUI panel for After Effects.
// build.js turns this template into ../HangulTypewriter.jsx (pure ASCII, expression inlined).
// Window > HangulTypewriter.jsx when installed in Scripts/ScriptUI Panels, or File > Scripts > Run Script File.
(function (thisObj) {
  var EXPRESSION = __EXPRESSION__;
  var P = "한글 타자 · ";
  var TAG = "// 한글 타입라이터";
  var SHAPES = ["|", "_", "▌", "▏"];

  // [이름, 종류, 기본값]
  var CONTROLS = [
    ["속도 (타/초)", "slider", 12],
    ["시작 시간 (초)", "slider", 0],
    ["리듬 흔들림 (%)", "slider", 30],
    ["문장부호 뒤 쉼 (초)", "slider", 0.3],
    ["자모 조합", "checkbox", 1],
    ["도깨비불", "checkbox", 1],
    ["수동 진행", "checkbox", 0],
    ["진행 (%)", "slider", 0],
    ["커서 표시", "checkbox", 1],
    ["커서 모양", "dropdown", 1],
    ["커서 깜빡임 (회/초)", "slider", 2],
    ["완료 후 커서 숨김 (초, 0=계속)", "slider", 0]
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
        kind = "slider"; // 드롭다운이 없는 AE 버전: 1~4 숫자로
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
    if (!layers) return alert("컴포지션을 열고 텍스트 레이어를 선택하세요.");
    if (!layers.length) return alert("텍스트 레이어를 하나 이상 선택하세요.");
    app.beginUndoGroup("한글 타입라이터 적용");
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
    if (!layers || !layers.length) return alert("텍스트 레이어를 선택하세요.");
    app.beginUndoGroup("한글 타입라이터 제거");
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
    if (!layers || !layers.length) return alert("텍스트 레이어를 선택하세요.");
    app.beginUndoGroup("한글 타입라이터 키프레임으로 굽기");
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
    var w = (root instanceof Panel) ? root : new Window("palette", "한글 타입라이터", undefined, { resizeable: true });
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 6;
    w.margins = 10;

    var g = w.add("group");
    g.add("statictext", undefined, "속도 (타/초)");
    var speed = g.add("edittext", undefined, "12");
    speed.characters = 5;

    var cursor = w.add("checkbox", undefined, "커서 표시");
    cursor.value = true;
    var ghost = w.add("checkbox", undefined, "도깨비불 (안 → 아나 처럼 받침이 넘어감)");
    ghost.value = true;

    var applyBtn = w.add("button", undefined, "선택한 텍스트 레이어에 적용");
    var row = w.add("group");
    row.alignChildren = ["fill", "center"];
    var bakeBtn = row.add("button", undefined, "키프레임으로 굽기");
    var removeBtn = row.add("button", undefined, "제거");

    var help = w.add("statictext", undefined,
      "적용 후 이펙트 컨트롤의 '한글 타자 ·' 항목으로 속도, 시작 시간, 커서 등을 바꿀 수 있어요. 텍스트는 그대로 수정하면 됩니다.",
      { multiline: true });
    help.preferredSize = [220, 60];

    applyBtn.onClick = function () {
      var v = parseFloat(speed.text);
      var o = {};
      if (!isNaN(v) && v > 0) o["속도 (타/초)"] = v;
      o["커서 표시"] = cursor.value ? 1 : 0;
      o["도깨비불"] = ghost.value ? 1 : 0;
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
