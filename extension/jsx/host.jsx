/*
 * ae-mcp host script (ExtendScript, ES3).
 * Loaded into After Effects by the Claude Bridge panel. Exposes one global,
 * aeMcp.dispatch(requestJson) -> responseJson, which the panel calls via evalScript.
 *
 * ExtendScript is ES3: no JSON, no Array.prototype.indexOf/forEach/map,
 * no let/const/arrow functions. Keep it that way.
 */
$.global.aeMcp = (function () {
    // ---------------------------------------------------------------- JSON

    var ESC = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

    function quote(s) {
        return '"' + s.replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
            return ESC[c] || '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }

    function stringify(v) {
        if (v === null || v === undefined) return 'null';
        var t = typeof v;
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'boolean') return String(v);
        if (t === 'string') return quote(v);
        if (t === 'function') return 'null';
        var parts = [], i;
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) parts.push(stringify(v[i]));
            return '[' + parts.join(',') + ']';
        }
        for (var k in v) {
            if (!v.hasOwnProperty(k)) continue;
            var x = v[k];
            if (x === undefined || typeof x === 'function') continue;
            parts.push(quote(k) + ':' + stringify(x));
        }
        return '{' + parts.join(',') + '}';
    }

    function parse(text) {
        var i = 0;
        function fail(msg) { throw new Error('JSON parse error at ' + i + ': ' + msg); }
        function ws() { while (i < text.length && ' \t\n\r'.indexOf(text.charAt(i)) >= 0) i++; }
        function expect(c) { if (text.charAt(i) !== c) fail('expected ' + c); i++; }
        function str() {
            expect('"');
            var out = [];
            for (;;) {
                var c = text.charAt(i++);
                if (c === '"') return out.join('');
                if (c === '') fail('unterminated string');
                if (c === '\\') {
                    var e = text.charAt(i++);
                    if (e === 'u') { out.push(String.fromCharCode(parseInt(text.substr(i, 4), 16))); i += 4; }
                    else if (e === 'b') out.push('\b');
                    else if (e === 'f') out.push('\f');
                    else if (e === 'n') out.push('\n');
                    else if (e === 'r') out.push('\r');
                    else if (e === 't') out.push('\t');
                    else out.push(e);
                } else out.push(c);
            }
        }
        function val() {
            ws();
            var c = text.charAt(i);
            if (c === '{') {
                i++; var o = {}; ws();
                if (text.charAt(i) === '}') { i++; return o; }
                for (;;) {
                    ws(); var k = str(); ws(); expect(':');
                    o[k] = val(); ws();
                    c = text.charAt(i++);
                    if (c === '}') return o;
                    if (c !== ',') fail('expected , or }');
                }
            }
            if (c === '[') {
                i++; var a = []; ws();
                if (text.charAt(i) === ']') { i++; return a; }
                for (;;) {
                    a.push(val()); ws();
                    c = text.charAt(i++);
                    if (c === ']') return a;
                    if (c !== ',') fail('expected , or ]');
                }
            }
            if (c === '"') return str();
            if (text.substr(i, 4) === 'true') { i += 4; return true; }
            if (text.substr(i, 5) === 'false') { i += 5; return false; }
            if (text.substr(i, 4) === 'null') { i += 4; return null; }
            var m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
            if (!m) fail('unexpected character ' + c);
            i += m[0].length;
            return parseFloat(m[0]);
        }
        var result = val(); ws();
        if (i < text.length) fail('trailing characters');
        return result;
    }

    // ------------------------------------------------------------- helpers

    function has(o, k) { return o !== null && o !== undefined && o[k] !== undefined && o[k] !== null; }

    function color(v, withAlpha) {
        var c = v;
        if (typeof v === 'string') {
            var h = v.replace('#', '');
            if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
            c = [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
        }
        if (!(c instanceof Array) || c.length < 3) throw new Error('Color must be "#rrggbb" or [r,g,b] with 0..1 values');
        var out = [c[0], c[1], c[2]];
        if (withAlpha) out.push(c.length > 3 ? c[3] : 1);
        return out;
    }

    function findComp(p) {
        var c = null, i;
        if (has(p, 'compId')) c = app.project.itemByID(p.compId);
        else if (has(p, 'compName')) {
            for (i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if (it instanceof CompItem && it.name === p.compName) { c = it; break; }
            }
        } else c = app.project.activeItem;
        if (!(c instanceof CompItem)) {
            throw new Error('Composition not found. Pass compId (see ae_get_project) or open a comp in the viewer.');
        }
        return c;
    }

    function findLayer(comp, p) {
        var i;
        if (has(p, 'layerId')) {
            for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) return comp.layer(i);
        } else if (has(p, 'layerIndex')) {
            if (p.layerIndex >= 1 && p.layerIndex <= comp.numLayers) return comp.layer(p.layerIndex);
        } else if (has(p, 'layerName')) {
            for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === p.layerName) return comp.layer(i);
        } else {
            throw new Error('Pass layerId, layerIndex or layerName.');
        }
        throw new Error('Layer not found in comp "' + comp.name + '".');
    }

    var TRANSFORM_NAMES = {
        'anchor point': 1, 'position': 1, 'x position': 1, 'y position': 1, 'z position': 1, 'scale': 1,
        'orientation': 1, 'rotation': 1, 'x rotation': 1, 'y rotation': 1, 'z rotation': 1, 'opacity': 1
    };

    function findProperty(layer, path) {
        var segs = path instanceof Array ? path.slice(0) : String(path).split('/');
        if (segs.length === 1) {
            var s = String(segs[0]).toLowerCase();
            if (TRANSFORM_NAMES[s]) segs = ['ADBE Transform Group', segs[0]];
            else if (s === 'source text') segs = ['ADBE Text Properties', 'ADBE Text Document'];
        }
        var prop = layer;
        for (var i = 0; i < segs.length; i++) {
            var next = prop.property(segs[i]);
            if (!next) throw new Error('Property not found: "' + segs[i] + '" under "' + prop.name + '"');
            prop = next;
        }
        if (prop.propertyType !== PropertyType.PROPERTY) throw new Error('"' + prop.name + '" is a group, not a property.');
        return prop;
    }

    var JUSTIFY = null;
    function justification(name) {
        if (!JUSTIFY) {
            JUSTIFY = {
                left: ParagraphJustification.LEFT_JUSTIFY,
                center: ParagraphJustification.CENTER_JUSTIFY,
                right: ParagraphJustification.RIGHT_JUSTIFY
            };
        }
        return JUSTIFY[name];
    }

    function textDocument(prop, v, time) {
        var doc = time === undefined ? prop.value : prop.valueAtTime(time, true);
        if (typeof v === 'string') { doc.text = v; return doc; }
        if (has(v, 'text')) doc.text = v.text;
        if (has(v, 'font')) doc.font = v.font;
        if (has(v, 'fontSize')) doc.fontSize = v.fontSize;
        if (has(v, 'fillColor')) { doc.applyFill = true; doc.fillColor = color(v.fillColor); }
        if (has(v, 'tracking')) doc.tracking = v.tracking;
        if (has(v, 'leading')) doc.leading = v.leading;
        if (has(v, 'justification')) doc.justification = justification(v.justification);
        return doc;
    }

    function toValue(prop, v, time) {
        var t = prop.propertyValueType;
        if (t === PropertyValueType.TEXT_DOCUMENT) return textDocument(prop, v, time);
        if (t === PropertyValueType.COLOR) return color(v, true);
        return v;
    }

    function serialize(v) {
        if (v === null || v === undefined) return null;
        var t = typeof v;
        if (t === 'number' || t === 'string' || t === 'boolean') return v;
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(serialize(v[i]));
            return a;
        }
        if (v instanceof TextDocument) {
            var d = { text: v.text };
            try { d.font = v.font; d.fontSize = v.fontSize; } catch (e1) {}
            try { if (v.applyFill) d.fillColor = serialize(v.fillColor); } catch (e2) {}
            return d;
        }
        return String(v);
    }

    function describeProperty(prop, depth) {
        var o = { name: prop.name, matchName: prop.matchName };
        if (prop.propertyType === PropertyType.PROPERTY) {
            var t = prop.propertyValueType;
            if (t !== PropertyValueType.NO_VALUE && t !== PropertyValueType.CUSTOM_VALUE && t !== PropertyValueType.SHAPE) {
                try { o.value = serialize(prop.value); } catch (e) {}
            }
            if (prop.numKeys > 0) o.numKeys = prop.numKeys;
            if (prop.canSetExpression && prop.expression) {
                o.expression = prop.expression;
                if (prop.expressionError) o.expressionError = prop.expressionError;
            }
        } else if (depth > 0) {
            o.children = [];
            for (var i = 1; i <= prop.numProperties; i++) o.children.push(describeProperty(prop.property(i), depth - 1));
        } else {
            o.numProperties = prop.numProperties;
        }
        return o;
    }

    function layerType(l) {
        if (l instanceof TextLayer) return 'text';
        if (l instanceof ShapeLayer) return 'shape';
        if (l instanceof CameraLayer) return 'camera';
        if (l instanceof LightLayer) return 'light';
        if (l.nullLayer) return 'null';
        if (l.source instanceof CompItem) return 'precomp';
        if (l.source && l.source.mainSource instanceof SolidSource) return 'solid';
        if (l.source) return 'footage';
        return 'other';
    }

    function layerInfo(l) {
        var o = {
            id: l.id, index: l.index, name: l.name, type: layerType(l),
            enabled: l.enabled, inPoint: l.inPoint, outPoint: l.outPoint, startTime: l.startTime
        };
        if (l.parent) o.parentId = l.parent.id;
        if (l.threeDLayer) o.threeD = true;
        if (l.source) o.sourceId = l.source.id;
        return o;
    }

    function compInfo(c) {
        return {
            id: c.id, name: c.name, width: c.width, height: c.height, pixelAspect: c.pixelAspect,
            duration: c.duration, frameRate: c.frameRate, time: c.time, numLayers: c.numLayers,
            bgColor: serialize(c.bgColor)
        };
    }

    function itemType(it) {
        if (it instanceof CompItem) return 'comp';
        if (it instanceof FolderItem) return 'folder';
        if (it instanceof FootageItem) return 'footage';
        return 'other';
    }

    // ------------------------------------------------------------ handlers
    // write: true wraps the call in one undo group, so Cmd+Z reverts it.

    var handlers = {};

    handlers.ping = { fn: function () {
        return {
            appVersion: app.version,
            projectFile: app.project.file ? app.project.file.fsName : null,
            activeCompId: app.project.activeItem instanceof CompItem ? app.project.activeItem.id : null
        };
    } };

    handlers.getProject = { fn: function () {
        var items = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            var o = { id: it.id, name: it.name, type: itemType(it) };
            if (it.parentFolder && it.parentFolder !== app.project.rootFolder) o.folderId = it.parentFolder.id;
            if (it instanceof CompItem) {
                o.width = it.width; o.height = it.height; o.duration = it.duration;
                o.frameRate = it.frameRate; o.numLayers = it.numLayers;
            } else if (it instanceof FootageItem && it.file) {
                o.file = it.file.fsName;
            }
            items.push(o);
        }
        return {
            projectFile: app.project.file ? app.project.file.fsName : null,
            activeCompId: app.project.activeItem instanceof CompItem ? app.project.activeItem.id : null,
            items: items
        };
    } };

    handlers.getComp = { fn: function (p) {
        var c = findComp(p), layers = [];
        for (var i = 1; i <= c.numLayers; i++) layers.push(layerInfo(c.layer(i)));
        var o = compInfo(c);
        o.layers = layers;
        return o;
    } };

    handlers.getLayer = { fn: function (p) {
        var c = findComp(p), l = findLayer(c, p);
        var o = layerInfo(l);
        var depth = has(p, 'depth') ? p.depth : 3;
        o.properties = [];
        for (var i = 1; i <= l.numProperties; i++) o.properties.push(describeProperty(l.property(i), depth - 1));
        return o;
    } };

    handlers.getSelection = { fn: function () {
        var c = app.project.activeItem;
        if (!(c instanceof CompItem)) return { compId: null, layers: [] };
        var layers = [], props = [], i;
        for (i = 0; i < c.selectedLayers.length; i++) layers.push(layerInfo(c.selectedLayers[i]));
        for (i = 0; i < c.selectedProperties.length; i++) {
            var sp = c.selectedProperties[i];
            props.push({ name: sp.name, matchName: sp.matchName, layerId: sp.propertyGroup(sp.propertyDepth).id });
        }
        return { compId: c.id, compName: c.name, time: c.time, layers: layers, properties: props };
    } };

    handlers.createComp = { write: true, fn: function (p) {
        var c = app.project.items.addComp(
            p.name, p.width || 1920, p.height || 1080, p.pixelAspect || 1, p.duration || 10, p.frameRate || 30
        );
        if (has(p, 'bgColor')) c.bgColor = color(p.bgColor);
        if (p.open !== false) c.openInViewer();
        return compInfo(c);
    } };

    function addShapeContents(layer, shape) {
        var contents = layer.property('ADBE Root Vectors Group');
        var group = contents.addProperty('ADBE Vector Group');
        var vectors = group.property('ADBE Vectors Group');
        var ellipse = shape.kind === 'ellipse';
        var path = vectors.addProperty(ellipse ? 'ADBE Vector Shape - Ellipse' : 'ADBE Vector Shape - Rect');
        path.property(ellipse ? 'ADBE Vector Ellipse Size' : 'ADBE Vector Rect Size').setValue(shape.size || [200, 200]);
        if (!ellipse && has(shape, 'roundness')) path.property('ADBE Vector Rect Roundness').setValue(shape.roundness);
        var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
        fill.property('ADBE Vector Fill Color').setValue(color(shape.fillColor || '#ffffff', true));
        if (has(shape, 'strokeColor')) {
            var stroke = vectors.addProperty('ADBE Vector Graphic - Stroke');
            stroke.property('ADBE Vector Stroke Color').setValue(color(shape.strokeColor, true));
            stroke.property('ADBE Vector Stroke Width').setValue(shape.strokeWidth || 4);
        }
    }

    handlers.addLayer = { write: true, fn: function (p) {
        var c = findComp(p), L = c.layers, l;
        var center = [c.width / 2, c.height / 2];
        switch (p.type) {
            case 'solid':
                l = L.addSolid(color(p.color || '#808080'), p.name || 'Solid', p.width || c.width, p.height || c.height, c.pixelAspect);
                break;
            case 'text':
                l = L.addText(p.text || '');
                if (has(p, 'textStyle')) {
                    var st = findProperty(l, 'Source Text');
                    st.setValue(textDocument(st, p.textStyle));
                }
                break;
            case 'shape':
                l = L.addShape();
                if (has(p, 'shape')) addShapeContents(l, p.shape);
                break;
            case 'null':
                l = L.addNull();
                break;
            case 'camera':
                l = L.addCamera(p.name || 'Camera', center);
                break;
            case 'light':
                l = L.addLight(p.name || 'Light', center);
                break;
            case 'footage':
                var item = app.project.itemByID(p.itemId);
                if (!item) throw new Error('Project item ' + p.itemId + ' not found.');
                l = L.add(item);
                break;
            default:
                throw new Error('Unknown layer type: ' + p.type);
        }
        if (has(p, 'name')) l.name = p.name;
        if (has(p, 'position')) findProperty(l, 'Position').setValue(p.position);
        return layerInfo(l);
    } };

    handlers.setLayer = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p);
        if (has(p, 'name')) l.name = p.name;
        if (has(p, 'enabled')) l.enabled = p.enabled;
        if (has(p, 'threeD')) l.threeDLayer = p.threeD;
        if (has(p, 'startTime')) l.startTime = p.startTime;
        if (has(p, 'inPoint')) l.inPoint = p.inPoint;
        if (has(p, 'outPoint')) l.outPoint = p.outPoint;
        if (has(p, 'label')) l.label = p.label;
        if (p.parentLayerId === 0) l.parent = null;
        else if (has(p, 'parentLayerId')) l.parent = findLayer(c, { layerId: p.parentLayerId });
        if (has(p, 'moveToIndex')) l.moveBefore(c.layer(p.moveToIndex));
        return layerInfo(l);
    } };

    handlers.deleteLayer = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p), info = layerInfo(l);
        l.remove();
        return { deleted: info };
    } };

    handlers.duplicateLayer = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p);
        var d = l.duplicate();
        if (has(p, 'name')) d.name = p.name;
        return layerInfo(d);
    } };

    handlers.setProperty = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p), prop = findProperty(l, p.path);
        if (prop.numKeys > 0) prop.setValueAtTime(c.time, toValue(prop, p.value, c.time));
        else prop.setValue(toValue(prop, p.value));
        return { layerId: l.id, property: prop.name, value: serialize(prop.value), keyed: prop.numKeys > 0 };
    } };

    function easeDims(prop) {
        var t = prop.propertyValueType;
        if (t === PropertyValueType.TwoD) return 2;
        if (t === PropertyValueType.ThreeD) return 3;
        return 1;
    }

    function eases(prop, influence) {
        var a = [], n = easeDims(prop);
        for (var i = 0; i < n; i++) a.push(new KeyframeEase(0, influence));
        return a;
    }

    handlers.setKeyframes = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p), prop = findProperty(l, p.path);
        var interp = {
            linear: KeyframeInterpolationType.LINEAR,
            bezier: KeyframeInterpolationType.BEZIER,
            hold: KeyframeInterpolationType.HOLD
        };
        if (p.clearExisting) while (prop.numKeys > 0) prop.removeKey(prop.numKeys);
        for (var i = 0; i < p.keyframes.length; i++) {
            var k = p.keyframes[i];
            prop.setValueAtTime(k.time, toValue(prop, k.value, k.time));
            var idx = prop.nearestKeyIndex(k.time);
            var hasEase = has(k, 'easeIn') || has(k, 'easeOut');
            if (k.interpolation) {
                prop.setInterpolationTypeAtKey(idx, interp[k.interpolation], interp[k.interpolation]);
            } else if (hasEase) {
                prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            }
            if (hasEase) {
                prop.setTemporalEaseAtKey(idx,
                    eases(prop, has(k, 'easeIn') ? k.easeIn : 33.33),
                    eases(prop, has(k, 'easeOut') ? k.easeOut : 33.33));
            }
        }
        return { layerId: l.id, property: prop.name, numKeys: prop.numKeys };
    } };

    handlers.setExpression = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p), prop = findProperty(l, p.path);
        if (!prop.canSetExpression) throw new Error('"' + prop.name + '" does not accept expressions.');
        prop.expression = p.expression || '';
        if (has(p, 'enabled')) prop.expressionEnabled = p.enabled;
        return { layerId: l.id, property: prop.name, expressionError: prop.expressionError || null };
    } };

    handlers.applyEffect = { write: true, fn: function (p) {
        var c = findComp(p), l = findLayer(c, p);
        var parade = l.property('ADBE Effect Parade');
        if (!parade.canAddProperty(p.effect)) throw new Error('Effect "' + p.effect + '" cannot be added (use its matchName, e.g. "ADBE Gaussian Blur 2").');
        var fx = parade.addProperty(p.effect);
        if (has(p, 'name')) fx.name = p.name;
        var failed = [];
        if (has(p, 'properties')) {
            for (var k in p.properties) {
                if (!p.properties.hasOwnProperty(k)) continue;
                var prop = fx.property(k);
                if (!prop) { failed.push(k); continue; }
                prop.setValue(toValue(prop, p.properties[k]));
            }
        }
        var o = { layerId: l.id, effect: describeProperty(fx, 1) };
        if (failed.length) o.unknownProperties = failed;
        return o;
    } };

    handlers.importFile = { write: true, fn: function (p) {
        var f = new File(p.path);
        if (!f.exists) throw new Error('File not found: ' + p.path);
        var opts = new ImportOptions(f);
        if (p.sequence) opts.sequence = true;
        var item = app.project.importFile(opts);
        var o = { itemId: item.id, name: item.name };
        if (has(p, 'compId') || p.addToActiveComp) {
            var c = findComp(p);
            o.layer = layerInfo(c.layers.add(item));
        }
        return o;
    } };

    handlers.renderFrame = { fn: function (p) {
        var c = findComp(p);
        var t = has(p, 'time') ? p.time : c.time;
        var f = new File(p.path);
        c.saveFrameToPng(t, f);
        return { compId: c.id, time: t, path: f.fsName };
    } };

    handlers.addToRenderQueue = { fn: function (p) {
        var c = findComp(p);
        var rq = app.project.renderQueue.items.add(c);
        var om = rq.outputModule(1);
        if (has(p, 'outputModuleTemplate')) om.applyTemplate(p.outputModuleTemplate);
        if (has(p, 'outputPath')) om.file = new File(p.outputPath);
        if (p.render) app.project.renderQueue.render();
        return { compId: c.id, queueIndex: app.project.renderQueue.numItems, output: om.file ? om.file.fsName : null };
    } };

    handlers.runJsx = { write: true, fn: function (p) {
        var r = eval(p.code);
        try { return parse(stringify(r)); } catch (e) { return String(r); }
    } };

    // ------------------------------------------------------------ dispatch

    function dispatch(requestJson) {
        var undo = false;
        try {
            var req = parse(requestJson);
            var h = handlers[req.method];
            if (!h) throw new Error('Unknown method: ' + req.method);
            if (h.write) { app.beginUndoGroup('Claude: ' + req.method); undo = true; }
            var result = h.fn(req.params || {});
            return stringify({ ok: true, result: result });
        } catch (e) {
            var msg = (e && e.message) ? e.message : String(e);
            if (e && e.line) msg += ' (host.jsx line ' + e.line + ')';
            return stringify({ ok: false, error: msg });
        } finally {
            if (undo) app.endUndoGroup();
        }
    }

    return { dispatch: dispatch, version: '0.1.0', _json: { parse: parse, stringify: stringify } };
})();
