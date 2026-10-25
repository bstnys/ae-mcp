// 한글 타입라이터 — Source Text expression.
// 한글을 두벌식 자판으로 치는 것처럼 자모 단위로 조립해 보여 준다 (ㄱ → 가 → 각, ㄱ → 가 → 간 → 가나).
// HangulTypewriter.jsx가 이 파일을 그대로 텍스트 레이어의 Source Text에 넣는다. build.js로 다시 만든다.
// 레거시 ExtendScript 엔진에서도 돌도록 ES3 문법만 쓴다.
var P = "한글 타자 · ";
function ctl(n, d) { try { return effect(P + n)(1).value; } catch (e) { return d; } }

var speed = Math.max(ctl("속도 (타/초)", 12), 0.01);
var start = ctl("시작 시간 (초)", 0);
var jitter = Math.min(Math.max(ctl("리듬 흔들림 (%)", 30), 0), 100) / 100;
var punctPause = Math.max(ctl("문장부호 뒤 쉼 (초)", 0.3), 0);
var jamo = ctl("자모 조합", 1) == 1;
var ghost = ctl("도깨비불", 1) == 1;
var manual = ctl("수동 진행", 0) == 1;
var cursorOn = ctl("커서 표시", 1) == 1;
var cursorShape = ctl("커서 모양", 1);
var blink = Math.max(ctl("커서 깜빡임 (회/초)", 2), 0);
var cursorHide = ctl("완료 후 커서 숨김 (초, 0=계속)", 0);

// 초성 → 종성 번호, 초성 → 호환 자모, 겹모음/겹받침의 첫 타, 받침 + 초성 → 겹받침
var LT = [1, 2, 4, 7, 0, 8, 16, 17, 0, 19, 20, 21, 22, 0, 23, 24, 25, 26, 27];
var CL = [0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145,
  0x3146, 0x3147, 0x3148, 0x3149, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E];
var VS = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };
var TS = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };
var TC = { "1_9": 3, "4_12": 5, "4_18": 6, "8_0": 9, "8_6": 10, "8_7": 11, "8_9": 12,
  "8_16": 13, "8_17": 14, "8_18": 15, "17_9": 18 };

function syl(l, v, t) { return String.fromCharCode(0xAC00 + (l * 21 + v) * 28 + t); }
function info(ch) {
  var c = ch.charCodeAt(0) - 0xAC00;
  if (ch.length != 1 || c < 0 || c > 11171) return null;
  return { l: Math.floor(c / 588), v: Math.floor((c % 588) / 28), t: c % 28 };
}
function strokes(ch) {
  var h = info(ch);
  if (!h || !jamo) return 1;
  return 2 + (VS[h.v] !== undefined ? 1 : 0) + (h.t ? 1 + (TS[h.t] !== undefined ? 1 : 0) : 0);
}
// ch를 j타(1 <= j < strokes(ch))까지 쳤을 때 보이는 글자
function partial(ch, j) {
  var h = info(ch);
  if (j == 1) return String.fromCharCode(CL[h.l]);
  var vc = VS[h.v] !== undefined;
  if (j == 2) return syl(h.l, vc ? VS[h.v] : h.v, 0);
  if (vc && j == 3) return syl(h.l, h.v, 0);
  return syl(h.l, h.v, TS[h.t] !== undefined ? TS[h.t] : h.t);
}
function isPause(ch) { return ".,!?…;:。、\r\n".indexOf(ch) >= 0; }

var src = (value && value.text !== undefined) ? value.text : String(value);
var chars = [], counts = [], N = 0, i, c;
for (i = 0; i < src.length; i++) {
  c = src.charAt(i);
  var cc = src.charCodeAt(i);
  if (cc >= 0xD800 && cc <= 0xDBFF && i + 1 < src.length) { c += src.charAt(i + 1); i++; }
  chars.push(c);
  counts.push(strokes(c));
  N += counts[counts.length - 1];
}

// 지금까지 친 타수
var shown = 0, typing = false, sinceLast = -1;
if (manual) {
  var prog = effect(P + "진행 (%)")(1);
  var p = Math.min(Math.max(prog.value, 0), 100);
  shown = Math.round(p / 100 * N);
  typing = Math.abs(p - prog.valueAtTime(time - thisComp.frameDuration)) > 0.0001 && shown < N;
  sinceLast = shown > 0 ? 0 : -1;
  if (shown >= N && N > 0) {
    // 100%에 처음 닿은 뒤 지난 시간 (커서 숨김용)
    var f = thisComp.frameDuration, back = 0;
    while (back < 600 && prog.valueAtTime(time - (back + 1) * f) >= 100) back++;
    sinceLast = back * f;
  }
} else {
  var el = time - inPoint - start, base = 1 / speed, t = 0, ci = 0, cj = 0;
  while (shown < N && t <= el) {
    shown++;
    sinceLast = el - t;
    var pause = 0;
    cj++;
    if (cj >= counts[ci]) { if (isPause(chars[ci])) pause = punctPause; ci++; cj = 0; }
    seedRandom(shown, true);
    t += base * (1 + jitter * (random() * 2 - 1)) + pause;
  }
  typing = shown > 0 && shown < N;
}

// 화면에 보일 글자
var rem = shown, k = 0;
while (k < chars.length && rem >= counts[k]) { rem -= counts[k]; k++; }
var out = chars.slice(0, k).join("");
if (rem > 0) {
  var h = info(chars[k]), pv = k > 0 ? info(chars[k - 1]) : null, nt = 0;
  if (rem == 1 && ghost && pv) nt = pv.t == 0 ? LT[h.l] : (TC[pv.t + "_" + h.l] || 0);
  if (nt) out = out.substring(0, out.length - 1) + syl(pv.l, pv.v, nt);
  else out += partial(chars[k], rem);
}

if (cursorOn) {
  var shapes = ["|", "_", "▌", "▏"];
  var cur = shapes[Math.max(1, Math.min(shapes.length, Math.round(cursorShape))) - 1];
  var done = N > 0 && shown >= N;
  var visible = typing || blink == 0 || Math.floor(time * blink * 2) % 2 == 0;
  if (done && cursorHide > 0 && sinceLast >= cursorHide) visible = false;
  if (visible) out += cur;
}
out;
