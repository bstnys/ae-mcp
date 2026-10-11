// A small in-memory imitation of the After Effects scripting DOM, enough to
// exercise host.jsx end to end in Node. It is not a full emulation.
//
// installMock is serialized and evaluated inside the vm context, so the
// arrays and objects it creates belong to that realm (instanceof Array works
// the same way it does for host.jsx in AE). It must not use outer variables.
import vm from 'node:vm';
import fs from 'node:fs';

function installMock(g, io) {
  var nextId = 1;
  g.PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
  g.PropertyValueType = {
    NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417,
    COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424,
  };
  g.KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
  g.ParagraphJustification = { LEFT_JUSTIFY: 7413, RIGHT_JUSTIFY: 7414, CENTER_JUSTIFY: 7415 };
  var VT = g.PropertyValueType;

  function KeyframeEase(speed, influence) {
    if (influence < 0.1 || influence > 100) throw new Error('influence out of range');
    this.speed = speed; this.influence = influence;
  }
  g.KeyframeEase = KeyframeEase;

  function TextDocument(text) {
    this.text = text; this.font = 'ArialMT'; this.fontSize = 36;
    this.applyFill = true; this.fillColor = [1, 1, 1]; this.justification = g.ParagraphJustification.LEFT_JUSTIFY;
    this.tracking = 0; this.leading = 0;
  }
  g.TextDocument = TextDocument;

  function clone(v) {
    if (v instanceof TextDocument) {
      var d = new TextDocument(v.text);
      for (var k in v) if (v.hasOwnProperty(k)) d[k] = v[k] instanceof Array ? v[k].slice() : v[k];
      return d;
    }
    return v instanceof Array ? v.slice() : v;
  }

  function checkValue(prop, v) {
    var n = { 6413: 3, 6414: 3, 6415: 2, 6416: 2, 6417: 0, 6418: 4 }[prop.propertyValueType];
    if (n === 0 && typeof v !== 'number') throw new Error(prop.name + ': expected a number');
    if (n && (!(v instanceof Array) || (v.length !== n && !(n === 3 && v.length === 2)))) {
      throw new Error(prop.name + ': expected array of ' + n);
    }
    if (prop.propertyValueType === VT.TEXT_DOCUMENT && !(v instanceof TextDocument)) throw new Error(prop.name + ': expected TextDocument');
  }

  // --------------------------------------------------------- properties
  function Property(name, matchName, type, value) {
    this.name = name; this.matchName = matchName; this.propertyValueType = type;
    this.propertyType = g.PropertyType.PROPERTY;
    this._value = value; this.keys = []; this._expr = ''; this.expressionError = '';
    this.expressionEnabled = true; this.canSetExpression = type !== VT.NO_VALUE;
  }
  Object.defineProperty(Property.prototype, 'value', { get: function () { return clone(this.keys.length ? this.keys[0].value : this._value); } });
  Object.defineProperty(Property.prototype, 'numKeys', { get: function () { return this.keys.length; } });
  Object.defineProperty(Property.prototype, 'expression', {
    get: function () { return this._expr; },
    set: function (e) { this._expr = e; this.expressionError = /SYNTAX_ERROR/.test(e) ? 'SyntaxError: bad expression' : ''; },
  });
  Property.prototype.setValue = function (v) {
    if (this.keys.length) throw new Error('setValue on a keyframed property');
    checkValue(this, v); this._value = clone(v);
  };
  Property.prototype.valueAtTime = function (t) {
    for (var i = 0; i < this.keys.length; i++) if (this.keys[i].time === t) return clone(this.keys[i].value);
    return this.value;
  };
  Property.prototype.setValueAtTime = function (t, v) {
    checkValue(this, v);
    for (var i = 0; i < this.keys.length; i++) if (this.keys[i].time === t) { this.keys[i].value = clone(v); return; }
    this.keys.push({ time: t, value: clone(v) });
    this.keys.sort(function (a, b) { return a.time - b.time; });
  };
  Property.prototype.nearestKeyIndex = function (t) {
    var best = 1;
    for (var i = 0; i < this.keys.length; i++) if (Math.abs(this.keys[i].time - t) < Math.abs(this.keys[best - 1].time - t)) best = i + 1;
    return best;
  };
  Property.prototype.removeKey = function (i) { this.keys.splice(i - 1, 1); };
  Property.prototype._key = function (i) { if (!this.keys[i - 1]) throw new Error('bad key index ' + i); return this.keys[i - 1]; };
  Property.prototype.setInterpolationTypeAtKey = function (i, a, b) { this._key(i).interp = [a, b]; };
  Property.prototype.setTemporalEaseAtKey = function (i, a, b) {
    var t = this.propertyValueType, n = t === VT.TwoD ? 2 : t === VT.ThreeD ? 3 : 1;
    if (a.length !== n || b.length !== n) throw new Error(this.name + ': ease array must have ' + n + ' entries');
    this._key(i).ease = [a, b];
  };

  function Group(name, matchName, children, factory) {
    this.name = name; this.matchName = matchName; this.children = children || [];
    this.factory = factory; this.propertyType = g.PropertyType.NAMED_GROUP;
  }
  Object.defineProperty(Group.prototype, 'numProperties', { get: function () { return this.children.length; } });
  Group.prototype.property = function (k) {
    if (typeof k === 'number') return this.children[k - 1] || null;
    for (var i = 0; i < this.children.length; i++) {
      if (this.children[i].name === k || this.children[i].matchName === k) return this.children[i];
    }
    return null;
  };
  Group.prototype.canAddProperty = function (m) { return !!(this.factory && this.factory(m)); };
  Group.prototype.addProperty = function (m) {
    var p = this.factory && this.factory(m);
    if (!p) throw new Error('Can not add property ' + m);
    this.children.push(p); return p;
  };

  function effectFactory(m) {
    if (m === 'ADBE Gaussian Blur 2' || m === 'Gaussian Blur') {
      return new Group('Gaussian Blur', 'ADBE Gaussian Blur 2', [
        new Property('Blurriness', 'ADBE Gaussian Blur 2-0001', VT.OneD, 0),
        new Property('Blur Dimensions', 'ADBE Gaussian Blur 2-0002', VT.OneD, 1),
      ]);
    }
    if (m === 'ADBE Fill' || m === 'Fill') {
      return new Group('Fill', 'ADBE Fill', [new Property('Color', 'ADBE Fill-0002', VT.COLOR, [1, 0, 0, 1])]);
    }
    return null;
  }

  function vectorsFactory(m) {
    if (m === 'ADBE Vector Shape - Rect') return new Group('Rectangle Path 1', m, [
      new Property('Size', 'ADBE Vector Rect Size', VT.TwoD, [100, 100]),
      new Property('Position', 'ADBE Vector Rect Position', VT.TwoD_SPATIAL, [0, 0]),
      new Property('Roundness', 'ADBE Vector Rect Roundness', VT.OneD, 0),
    ]);
    if (m === 'ADBE Vector Shape - Ellipse') return new Group('Ellipse Path 1', m, [
      new Property('Size', 'ADBE Vector Ellipse Size', VT.TwoD, [100, 100]),
    ]);
    if (m === 'ADBE Vector Graphic - Fill') return new Group('Fill 1', m, [
      new Property('Color', 'ADBE Vector Fill Color', VT.COLOR, [1, 1, 1, 1]),
    ]);
    if (m === 'ADBE Vector Graphic - Stroke') return new Group('Stroke 1', m, [
      new Property('Color', 'ADBE Vector Stroke Color', VT.COLOR, [1, 1, 1, 1]),
      new Property('Stroke Width', 'ADBE Vector Stroke Width', VT.OneD, 2),
    ]);
    return null;
  }

  function rootVectorsFactory(m) {
    if (m !== 'ADBE Vector Group') return null;
    return new Group('Group 1', m, [new Group('Contents', 'ADBE Vectors Group', [], vectorsFactory)]);
  }

  // --------------------------------------------------------- layers
  function Layer(comp, name) {
    this.id = nextId++; this.comp = comp; this.name = name;
    this.enabled = true; this.inPoint = 0; this.outPoint = comp.duration; this.startTime = 0;
    this.parent = null; this.threeDLayer = false; this.label = 0; this.nullLayer = false; this.source = null;
    this.children = [
      new Group('Transform', 'ADBE Transform Group', [
        new Property('Anchor Point', 'ADBE Anchor Point', VT.ThreeD_SPATIAL, [0, 0, 0]),
        new Property('Position', 'ADBE Position', VT.ThreeD_SPATIAL, [comp.width / 2, comp.height / 2, 0]),
        new Property('Scale', 'ADBE Scale', VT.ThreeD, [100, 100, 100]),
        new Property('Rotation', 'ADBE Rotate Z', VT.OneD, 0),
        new Property('Opacity', 'ADBE Opacity', VT.OneD, 100),
      ]),
      new Group('Effects', 'ADBE Effect Parade', [], effectFactory),
    ];
  }
  Layer.prototype = Object.create(Group.prototype);
  Object.defineProperty(Layer.prototype, 'index', { get: function () { return this.comp._layers.indexOf(this) + 1; } });
  Layer.prototype.remove = function () { this.comp._layers.splice(this.index - 1, 1); };
  Layer.prototype.moveBefore = function (other) {
    this.remove(); this.comp._layers.splice(other.index - 1, 0, this);
  };
  Layer.prototype.duplicate = function () {
    var d = Object.create(Object.getPrototypeOf(this));
    for (var k in this) if (this.hasOwnProperty(k)) d[k] = this[k];
    d.id = nextId++;
    this.comp._layers.splice(this.index - 1, 0, d);
    return d;
  };

  function AVLayer(comp, name, source) { Layer.call(this, comp, name); this.source = source || null; }
  AVLayer.prototype = Object.create(Layer.prototype);
  function TextLayer(comp, text) {
    AVLayer.call(this, comp, text);
    this.children.push(new Group('Text', 'ADBE Text Properties', [
      new Property('Source Text', 'ADBE Text Document', VT.TEXT_DOCUMENT, new TextDocument(text)),
    ]));
  }
  TextLayer.prototype = Object.create(AVLayer.prototype);
  function ShapeLayer(comp) {
    AVLayer.call(this, comp, 'Shape Layer 1');
    this.children.unshift(new Group('Contents', 'ADBE Root Vectors Group', [], rootVectorsFactory));
  }
  ShapeLayer.prototype = Object.create(AVLayer.prototype);
  function CameraLayer(comp, name) { Layer.call(this, comp, name); }
  CameraLayer.prototype = Object.create(Layer.prototype);
  function LightLayer(comp, name) { Layer.call(this, comp, name); }
  LightLayer.prototype = Object.create(Layer.prototype);
  g.AVLayer = AVLayer; g.TextLayer = TextLayer; g.ShapeLayer = ShapeLayer; g.CameraLayer = CameraLayer; g.LightLayer = LightLayer;

  // --------------------------------------------------------- items
  function SolidSource(color) { this.color = color; }
  g.SolidSource = SolidSource;
  function FolderItem(name) { this.id = nextId++; this.name = name; }
  function FootageItem(name, mainSource, file) { this.id = nextId++; this.name = name; this.mainSource = mainSource; this.file = file || null; }
  g.FolderItem = FolderItem; g.FootageItem = FootageItem;

  function CompItem(name, w, h, pa, dur, fps) {
    this.id = nextId++; this.name = name; this.width = w; this.height = h; this.pixelAspect = pa;
    this.duration = dur; this.frameRate = fps; this.time = 0; this.bgColor = [0, 0, 0];
    this._layers = []; this.selectedLayers = []; this.selectedProperties = [];
    var comp = this;
    function top(l) { comp._layers.unshift(l); return l; }
    this.layers = {
      addSolid: function (color, name, w2, h2) {
        if (!(color instanceof Array) || color.length !== 3) throw new Error('addSolid: bad color');
        var src = new FootageItem(name, new SolidSource(color));
        g.app.project._items.push(src);
        return top(new AVLayer(comp, name, src));
      },
      addText: function (t) { return top(new TextLayer(comp, t)); },
      addShape: function () { return top(new ShapeLayer(comp)); },
      addNull: function () {
        var l = new AVLayer(comp, 'Null 1', new FootageItem('Null 1', new SolidSource([1, 1, 1])));
        l.nullLayer = true; return top(l);
      },
      addCamera: function (name) { return top(new CameraLayer(comp, name)); },
      addLight: function (name) { return top(new LightLayer(comp, name)); },
      add: function (item) { return top(new AVLayer(comp, item.name, item)); },
    };
  }
  Object.defineProperty(CompItem.prototype, 'numLayers', { get: function () { return this._layers.length; } });
  CompItem.prototype.layer = function (k) {
    if (typeof k === 'number') return this._layers[k - 1] || null;
    for (var i = 0; i < this._layers.length; i++) if (this._layers[i].name === k) return this._layers[i];
    return null;
  };
  CompItem.prototype.openInViewer = function () { g.app.project.activeItem = this; };
  CompItem.prototype.saveFrameToPng = function (t, file) { io.writePng(file.fsName); };
  g.CompItem = CompItem;

  function File(p) { this.fsName = p; }
  Object.defineProperty(File.prototype, 'exists', { get: function () { return io.exists(this.fsName); } });
  g.File = File;
  g.ImportOptions = function (file) { this.file = file; this.sequence = false; };

  var root = new FolderItem('Root');
  var project = {
    _items: [], activeItem: null, file: null, rootFolder: root,
    get numItems() { return this._items.length; },
    item: function (i) { return this._items[i - 1]; },
    itemByID: function (id) { for (var i = 0; i < this._items.length; i++) if (this._items[i].id === id) return this._items[i]; return null; },
    importFile: function (opts) {
      var it = new FootageItem(opts.file.fsName.split('/').pop(), null, opts.file);
      this._items.push(it); return it;
    },
    renderQueue: { _items: [], rendered: false, get numItems() { return this._items.length; }, render: function () { this.rendered = true; } },
  };
  project.items = {
    addComp: function (name, w, h, pa, dur, fps) { var c = new CompItem(name, w, h, pa, dur, fps); project._items.push(c); return c; },
  };
  project.renderQueue.items = {
    add: function (comp) {
      var om = { file: null, template: null, applyTemplate: function (t) { this.template = t; } };
      var rqi = { comp: comp, outputModule: function () { return om; } };
      project.renderQueue._items.push(rqi); return rqi;
    },
  };

  g.app = {
    version: '26.0x00', project: project, undoLog: [], _undoDepth: 0,
    beginUndoGroup: function (n) { this._undoDepth++; this.undoLog.push(n); },
    endUndoGroup: function () { if (this._undoDepth-- <= 0) throw new Error('unbalanced endUndoGroup'); },
  };
}

// Tiny valid 1x1 PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

export function createAeContext() {
  const ctx = vm.createContext({});
  const io = {
    exists: (p) => fs.existsSync(p),
    writePng: (p) => fs.writeFileSync(p, PNG_1X1),
  };
  vm.runInContext('(' + installMock.toString() + ')', ctx)(ctx, io);
  ctx.$ = {
    evalFile: (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }),
  };
  vm.runInContext('$.global = this;', ctx);
  return ctx;
}

// Behaves like CEP's evalScript: always calls back with a string.
export function evalScriptIn(ctx) {
  return (script, cb) => {
    setImmediate(() => {
      let out;
      try {
        out = vm.runInContext(script, ctx);
      } catch {
        out = 'EvalScript error.';
      }
      cb(out === undefined ? 'undefined' : String(out));
    });
  };
}
