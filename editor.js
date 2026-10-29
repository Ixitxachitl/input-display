/*
  Input Display: editor (index.html)
  ----------------------------------
  Drag parts around the canvas, resize them from the corner handle, and bind them by pressing the input. The
  layout being edited is kept in this browser between visits; "Save" adds it to My layouts. The overlay link
  is a preset id while a preset is unchanged, and the whole layout, encoded, once it isn't.
*/
(function () {
  'use strict';
  const ID = window.InputDisplay;
  const $ = (s) => document.querySelector(s);
  const mk = ID.mk;

  const SAVED_KEY = 'inputDisplay.saved';
  const WORK_KEY = 'inputDisplay.work';
  const OPTS_KEY = 'inputDisplay.opts';

  function load(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? def : v;
    } catch (e) {
      return def;
    }
  }
  function store(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ------------------------------------------------------------------------------------------------ state

  const S = {
    layout: null, // the layout being edited
    preset: null, // the preset it is, while it's unchanged
    savedId: null, // which of My layouts it is
    dirty: false, // changed since it was opened or saved
    sel: -1,
    undo: [],
    redo: [],
    snap: 10,
    opts: Object.assign({ theme: 'dark', colors: true, glow: false, body: true, pad: 'auto', idle: 0 }, load(OPTS_KEY, {})),
  };
  if (!ID.themes[S.opts.theme]) S.opts.theme = 'dark';
  let saved = load(SAVED_KEY, {});

  const input = new ID.Input({ pad: 'auto' });
  function applyPadOpt() {
    input.pad = S.opts.pad === 'auto' ? 'auto' : +S.opts.pad - 1;
  }
  applyPadOpt();

  const snapshot = () => JSON.stringify(S.layout);

  // Records an undo step if the layout changed since `before`
  function commit(before) {
    if (before == null || before === snapshot()) return;
    S.undo.push({ layout: before, sel: S.sel, preset: S.preset });
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    S.preset = null;
    S.dirty = true;
    afterChange();
  }

  // Runs fn as one undoable change
  function change(fn) {
    const before = snapshot();
    fn();
    drawCanvas();
    commit(before);
    buildProps();
  }

  function afterChange() {
    saveWork();
    scheduleUrl();
    updateButtons();
    markCurrent();
  }

  function undoRedo(from, to) {
    const step = from.pop();
    if (!step) return;
    to.push({ layout: snapshot(), sel: S.sel, preset: S.preset });
    S.layout = JSON.parse(step.layout);
    S.preset = step.preset;
    S.sel = step.sel < S.layout.els.length ? step.sel : -1;
    S.dirty = true;
    drawCanvas();
    buildProps();
    afterChange();
  }

  function saveWork() {
    store(WORK_KEY, { layout: S.layout, preset: S.preset, savedId: S.savedId, dirty: S.dirty });
  }

  function openLayout(layout, from) {
    from = from || {};
    S.layout = layout;
    S.preset = from.preset || null;
    S.savedId = from.saved || null;
    S.dirty = !!from.dirty;
    S.sel = -1;
    S.undo = [];
    S.redo = [];
    rawShape = '';
    drawCanvas();
    buildProps();
    afterChange();
  }

  function confirmDiscard() {
    return !S.dirty || confirm("Your changes to this layout aren't saved. Open another one anyway?");
  }

  // ----------------------------------------------------------------------------------------------- canvas

  const canvas = $('#canvas');
  let view = null;
  let selLayer = null;
  const PAD = 24;

  function renderOpts() {
    return { theme: S.opts.theme, colors: S.opts.colors, glow: S.opts.glow };
  }

  function drawCanvas() {
    const L = S.layout;
    canvas.setAttribute('viewBox', -PAD + ' ' + -PAD + ' ' + (L.w + PAD * 2) + ' ' + (L.h + PAD * 2));
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
    mk('rect', { x: 0, y: 0, width: L.w, height: L.h, fill: '#ffffff05', stroke: '#ffffff38', 'stroke-dasharray': '6 5',
      'vector-effect': 'non-scaling-stroke' }, canvas);
    const art = mk('svg', { x: 0, y: 0, width: L.w, height: L.h, overflow: 'visible' }, canvas);
    view = ID.render(art, L, renderOpts());
    selLayer = mk('g', {}, canvas);
    drawSelection();
  }

  function unitsPerPx() {
    const m = canvas.getScreenCTM();
    return m && m.a ? 1 / m.a : 1;
  }

  function scaleOf(e) {
    return e.t === 'shape' && e.d && e.sc ? e.sc : 1;
  }

  function drawSelection() {
    if (!selLayer) return;
    while (selLayer.firstChild) selLayer.removeChild(selLayer.firstChild);
    const g = view && view.groups[S.sel];
    if (S.sel < 0 || !g) return;
    const e = S.layout.els[S.sel];
    let bb;
    try {
      bb = g.getBBox();
    } catch (err) {
      return;
    }
    const px = unitsPerPx() / scaleOf(e);
    const sg = mk('g', { transform: ID.transformOf(e), 'pointer-events': 'none' }, selLayer);
    const m = 5 * px;
    mk('rect', { x: bb.x - m, y: bb.y - m, width: bb.width + m * 2, height: bb.height + m * 2, fill: 'none',
      stroke: '#38c8ff', 'stroke-width': 1.5 * px, 'stroke-dasharray': 5 * px + ' ' + 4 * px }, sg);
    const hs = 12 * px;
    mk('rect', { x: bb.x + bb.width + m - hs / 2, y: bb.y + bb.height + m - hs / 2, width: hs, height: hs, rx: 2 * px,
      fill: '#38c8ff', stroke: '#0b1520', 'stroke-width': px, 'data-h': 1, 'pointer-events': 'all',
      style: 'cursor:nwse-resize' }, sg);
  }

  function toCanvas(ev) {
    const m = canvas.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function snapTo(v, alt) {
    return alt || S.snap <= 1 ? Math.round(v) : Math.round(v / S.snap) * S.snap;
  }

  let drag = null;

  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    const pt = toCanvas(ev);
    if (ev.target.closest('[data-h]') && S.sel >= 0) {
      const e = S.layout.els[S.sel];
      const g = view.groups[S.sel];
      drag = { mode: 'size', e: e, start: pt, before: snapshot(), w0: e.w, h0: e.h, fs0: e.fs || 24, sc0: e.sc || 1,
        bb: g.getBBox() };
    } else {
      const g = ev.target.closest('[data-i]');
      if (!g) {
        select(-1);
        return;
      }
      select(+g.dataset.i);
      const e = S.layout.els[S.sel];
      drag = { mode: 'move', e: e, start: pt, before: snapshot(), x0: e.x || 0, y0: e.y || 0 };
    }
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    const pt = toCanvas(ev);
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    const e = drag.e;
    if (drag.mode === 'move') {
      e.x = snapTo(drag.x0 + dx, ev.altKey);
      e.y = snapTo(drag.y0 + dy, ev.altKey);
      view.groups[S.sel].setAttribute('transform', ID.transformOf(e));
      drawSelection();
      syncFields();
      return;
    }
    // resizing from the corner handle, about the centre, in the part's own (rotated) frame
    const a = (-(e.r || 0) * Math.PI) / 180;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) * 2;
    const ly = (dx * Math.sin(a) + dy * Math.cos(a)) * 2;
    if (e.t === 'label') e.fs = Math.max(6, Math.round(drag.fs0 * (1 + ly / Math.max(10, drag.bb.height))));
    else if (e.t === 'shape' && e.d) {
      e.sc = Math.max(0.05, Math.round(drag.sc0 * (1 + lx / drag.sc0 / Math.max(10, drag.bb.width)) * 100) / 100);
    } else if (e.t === 'stick' || e.t === 'dpad' || e.t === 'lever' || (e.t === 'btn' && drag.w0 === drag.h0 && !ev.shiftKey)) {
      const s = Math.max(10, Math.round(drag.w0 + Math.max(lx, ly)));
      e.w = e.h = s;
    } else {
      e.w = Math.max(8, Math.round(drag.w0 + lx));
      e.h = Math.max(8, Math.round(drag.h0 + ly));
    }
    drawCanvas();
    syncFields();
  });

  function endDrag() {
    if (!drag) return;
    const before = drag.before;
    drag = null;
    commit(before);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  addEventListener('resize', drawSelection);

  function select(i) {
    if (i === S.sel) return;
    S.sel = i;
    drawSelection();
    buildProps();
    updateButtons();
  }

  // ------------------------------------------------------------------------------------------ adding parts

  const NEW = {
    btn: () => ({ t: 'btn', w: 70, h: 70, shape: 'circle', label: '', bind: '' }),
    stick: () => ({ t: 'stick', w: 120, h: 120, bx: 'a0', by: 'a1', bind: 'b10' }),
    trig: () => ({ t: 'trig', w: 150, h: 56, label: '', bind: 'b6', dir: 'up' }),
    dpad: () => ({ t: 'dpad', w: 120, h: 120, bu: 'b12|h9u', bd: 'b13|h9d', bl: 'b14|h9l', br: 'b15|h9r' }),
    lever: () => ({ t: 'lever', w: 200, h: 200, gate: 'square', c: '#e5484d', bu: 'b12|a1-|h9u', bd: 'b13|a1+|h9d',
      bl: 'b14|a0-|h9l', br: 'b15|a0+|h9r' }),
    label: () => ({ t: 'label', label: 'Text', fs: 28 }),
    shape: () => ({ t: 'shape', shape: 'round', w: 320, h: 200 }),
  };

  function add(t) {
    change(function () {
      const L = S.layout;
      const e = NEW[t]();
      e.x = snapTo(L.w / 2);
      e.y = snapTo(L.h / 2);
      // don't drop it exactly on top of the last one added
      while (L.els.some((o) => o.t === e.t && o.x === e.x && o.y === e.y)) {
        e.x += 30;
        e.y += 30;
      }
      if (t === 'shape') {
        L.els.unshift(e);
        S.sel = 0;
      } else {
        L.els.push(e);
        S.sel = L.els.length - 1;
      }
    });
  }

  function duplicate(mirror) {
    if (S.sel < 0) return;
    const src = S.layout.els[S.sel];
    if (mirror && src.t === 'shape' && src.d) return toast("Path shapes can't be mirrored");
    change(function () {
      const e = JSON.parse(JSON.stringify(src));
      if (mirror) {
        e.x = S.layout.w - (e.x || 0);
        if (e.r) e.r = -e.r;
      } else {
        e.x = (e.x || 0) + Math.max(20, S.snap * 2);
        e.y = (e.y || 0) + Math.max(20, S.snap * 2);
      }
      S.layout.els.splice(S.sel + 1, 0, e);
      S.sel += 1;
    });
  }

  function remove() {
    if (S.sel < 0) return;
    change(function () {
      S.layout.els.splice(S.sel, 1);
      S.sel = -1;
    });
  }

  function reorder(dir) {
    const i = S.sel;
    const j = dir === 'top' ? S.layout.els.length - 1 : dir === 'bottom' ? 0 : i + dir;
    if (i < 0 || j < 0 || j >= S.layout.els.length || j === i) return;
    change(function () {
      const [e] = S.layout.els.splice(i, 1);
      S.layout.els.splice(j, 0, e);
      S.sel = j;
    });
  }

  // shrinks or grows the canvas to fit everything, with a margin
  function fitCanvas() {
    let bb;
    try {
      bb = view.root.getBBox();
    } catch (e) {
      return;
    }
    if (!bb.width || !bb.height) return;
    const m = 24;
    change(function () {
      const dx = Math.round(m - bb.x);
      const dy = Math.round(m - bb.y);
      for (const e of S.layout.els) {
        e.x = (e.x || 0) + dx;
        e.y = (e.y || 0) + dy;
      }
      S.layout.w = Math.ceil(bb.width + m * 2);
      S.layout.h = Math.ceil(bb.height + m * 2);
    });
  }

  document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => add(b.dataset.add)));
  $('#dupBtn').addEventListener('click', () => duplicate(false));
  $('#mirrorBtn').addEventListener('click', () => duplicate(true));
  $('#delBtn').addEventListener('click', remove);
  $('#undoBtn').addEventListener('click', () => undoRedo(S.undo, S.redo));
  $('#redoBtn').addEventListener('click', () => undoRedo(S.redo, S.undo));
  $('#snap').addEventListener('change', (ev) => (S.snap = +ev.target.value));

  function updateButtons() {
    $('#undoBtn').disabled = !S.undo.length;
    $('#redoBtn').disabled = !S.redo.length;
    for (const id of ['#dupBtn', '#mirrorBtn', '#delBtn']) $(id).disabled = S.sel < 0;
  }

  addEventListener('keydown', function (ev) {
    if (cap) {
      ev.preventDefault();
      if (ev.code === 'Escape') stopCapture();
      else if (!ev.repeat) finishCapture('k:' + ev.code);
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (ctrl && k === 'z' && !ev.shiftKey) undoRedo(S.undo, S.redo);
    else if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) undoRedo(S.redo, S.undo);
    else if (ctrl && k === 'd') duplicate(false);
    else if (ev.key === 'Delete' || ev.key === 'Backspace') remove();
    else if (ev.key === 'Escape') select(-1);
    else if (S.sel >= 0 && ev.key.indexOf('Arrow') === 0) {
      const n = ev.shiftKey ? 10 : 1;
      const e = S.layout.els[S.sel];
      change(function () {
        if (ev.key === 'ArrowLeft') e.x = (e.x || 0) - n;
        if (ev.key === 'ArrowRight') e.x = (e.x || 0) + n;
        if (ev.key === 'ArrowUp') e.y = (e.y || 0) - n;
        if (ev.key === 'ArrowDown') e.y = (e.y || 0) + n;
      });
    } else return;
    ev.preventDefault();
  });

  // ------------------------------------------------------------------------------------- binding capture
  // Press (or move) the input to bind it: whatever changes first on any controller, or a key.

  let cap = null;

  function padSnap(p) {
    return { b: p.buttons.map((b) => b.value || (b.pressed ? 1 : 0)), a: p.axes.slice() };
  }

  function startCapture(kind, done, button) {
    stopCapture();
    const base = {};
    for (const p of input.pads()) base[p.index] = padSnap(p);
    cap = { kind: kind, done: done, button: button, base: base, t0: performance.now(), text: button.textContent };
    button.classList.add('capturing');
    button.textContent = kind === 'axis' ? 'Move it…' : 'Press…';
    button.title = 'Press the input now (Esc cancels)';
  }

  function stopCapture() {
    if (!cap) return;
    cap.button.classList.remove('capturing');
    cap.button.textContent = cap.text;
    cap.button.title = '';
    cap = null;
  }

  function finishCapture(b) {
    const done = cap.done;
    stopCapture();
    done(b);
  }

  function checkCapture() {
    if (!cap) return;
    if (performance.now() - cap.t0 > 10000) return stopCapture();
    for (const p of input.pads()) {
      const cur = padSnap(p);
      const base = cap.base[p.index];
      if (!base) {
        cap.base[p.index] = cur;
        continue;
      }
      const b = ID.detect(base, cur, cap.kind);
      if (b) return finishCapture(b);
    }
  }

  // ---------------------------------------------------------------------------------------- properties

  let fieldSeq = 0;

  // Hooks a control up: changes show straight away, and each finished edit is one undo step
  function wire(ctrl, apply) {
    let before = null;
    ctrl.addEventListener('focus', () => (before = snapshot()));
    ctrl.addEventListener('input', function () {
      if (before == null) before = snapshot();
      apply();
      drawCanvas();
    });
    ctrl.addEventListener('change', function () {
      if (before == null) before = snapshot();
      apply();
      drawCanvas();
      commit(before);
      before = snapshot();
      refreshLayers();
    });
  }

  function field(parent, label, ctrl) {
    const f = el('div', 'field');
    const l = el('label', null, label);
    ctrl.id = ctrl.id || 'f' + ++fieldSeq;
    l.htmlFor = ctrl.id;
    f.append(l, ctrl);
    parent.append(f);
    return f;
  }

  function num(parent, label, obj, key, o) {
    o = o || {};
    const i = el('input');
    i.type = 'number';
    i.step = o.step || 1;
    if (o.min != null) i.min = o.min;
    if (o.max != null) i.max = o.max;
    i.value = obj[key] == null ? o.def == null ? '' : o.def : obj[key];
    i.dataset.k = key;
    wire(i, function () {
      const v = parseFloat(i.value);
      if (isNaN(v)) delete obj[key];
      else obj[key] = o.min != null ? Math.max(o.min, v) : v;
      if (o.also) o.also(v);
    });
    return field(parent, label, i);
  }

  function txt(parent, label, obj, key, ph) {
    const i = el('input');
    i.type = 'text';
    i.value = obj[key] || '';
    if (ph) i.placeholder = ph;
    wire(i, () => (i.value ? (obj[key] = i.value) : delete obj[key]));
    return field(parent, label, i);
  }

  function pick(parent, label, obj, key, options, def) {
    const s = el('select');
    for (const [v, t] of options) {
      const o = el('option', null, t);
      o.value = v;
      s.append(o);
    }
    s.value = obj[key] || def || '';
    wire(s, () => (s.value ? (obj[key] = s.value) : delete obj[key]));
    return field(parent, label, s);
  }

  function check(parent, label, obj, key) {
    const l = el('label', 'check');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = !!obj[key];
    wire(c, () => (c.checked ? (obj[key] = true) : delete obj[key]));
    l.append(c, document.createTextNode(label));
    parent.append(l);
  }

  function colorField(parent, label, obj, key, fallback) {
    const row = el('div', 'color-row');
    const c = el('input');
    c.type = 'color';
    const none = el('span', 'none');
    const clear = el('button', null, 'Clear');
    clear.type = 'button';
    function show() {
      c.value = /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : fallback || '#ffffff';
      none.textContent = obj[key] ? obj[key] : 'theme';
      clear.disabled = !obj[key];
    }
    show();
    wire(c, function () {
      obj[key] = c.value;
      show();
    });
    clear.addEventListener('click', function () {
      change(() => delete obj[key]);
    });
    row.append(c, none, clear);
    const f = field(parent, label, row);
    f.querySelector('label').htmlFor = c.id = 'f' + ++fieldSeq;
    return f;
  }

  const KIND_HINT = { axis: 'Bind, then move the stick', trigger: 'Bind, then press it', button: 'Bind, then press it' };

  function bindField(parent, label, obj, key, kind) {
    kind = kind || 'button';
    const row = el('div', 'bind-row');
    const i = el('input');
    i.type = 'text';
    i.value = obj[key] || '';
    i.placeholder = 'not bound';
    i.spellcheck = false;
    wire(i, () => (i.value.trim() ? (obj[key] = i.value.trim()) : delete obj[key]));
    const set = el('button', null, 'Bind');
    set.type = 'button';
    set.title = KIND_HINT[kind];
    const more = el('button', null, '+');
    more.type = 'button';
    more.title = 'Add another input that also counts (e.g. a key, or the stick as well as the d-pad)';
    function got(b, append) {
      change(function () {
        obj[key] = append && obj[key] ? obj[key] + '|' + b : b;
      });
      toast('Bound to ' + b);
    }
    set.addEventListener('click', () => startCapture(kind, (b) => got(b, false), set));
    more.addEventListener('click', () => startCapture(kind, (b) => got(b, true), more));
    row.append(i, set, more);
    const f = field(parent, label, row);
    f.querySelector('label').htmlFor = i.id = 'f' + ++fieldSeq;
    return f;
  }

  // puts the position and size fields back in step after dragging
  function syncFields() {
    if (S.sel < 0) return;
    const e = S.layout.els[S.sel];
    document.querySelectorAll('#props [data-k]').forEach(function (i) {
      if (document.activeElement !== i) i.value = e[i.dataset.k] == null ? '' : e[i.dataset.k];
    });
  }

  function partName(e) {
    const what = e.label || e.icon || (e.t === 'shape' ? (e.d ? 'path' : e.shape || 'round') : '');
    const bind = e.bind || e.bx || '';
    return ID.types[e.t] + (what ? ' · ' + what : '') + (bind ? ' · ' + bind.split('|')[0] : '');
  }

  function refreshLayers() {
    const box = $('#layers');
    if (!box) return;
    box.innerHTML = '';
    // topmost first, like most editors
    for (let i = S.layout.els.length - 1; i >= 0; i--) {
      const b = el('button', i === S.sel ? 'sel' : '', partName(S.layout.els[i]));
      b.type = 'button';
      b.addEventListener('click', () => select(i));
      box.append(b);
    }
    if (!S.layout.els.length) box.append(el('div', 'empty', 'Nothing yet. Add parts from the toolbar.'));
  }

  const BTN_SHAPES = [['circle', 'Circle'], ['round', 'Rounded'], ['rect', 'Square'], ['pill', 'Pill']];
  const ICONS = [['', 'None (use the label)']].concat(Object.keys(ID.icons).map((k) => [k, k]));

  function buildProps() {
    const box = $('#props');
    box.innerHTML = '';
    fieldSeq = 0;
    box.append(el('h2', null, 'Parts'));
    const layers = el('div', 'layers');
    layers.id = 'layers';
    box.append(layers);
    refreshLayers();
    box.append(el('div', 'hint', 'Drag to move (Alt: no snap), corner handle to resize, arrows to nudge.'));
    if (S.sel < 0) layoutProps(box);
    else partProps(box, S.layout.els[S.sel]);
  }

  function layoutProps(box) {
    const L = S.layout;
    box.append(el('h2', null, 'Layout'));
    txt(box, 'Name', L, 'name', 'My layout');
    const g = el('div', 'grid2');
    box.append(g);
    num(g, 'Width', L, 'w', { min: 50 });
    num(g, 'Height', L, 'h', { min: 50 });
    num(box, 'Outline width', L, 'sw', { min: 0, step: 0.5, def: 3 });
    const row = el('div', 'row');
    const fit = el('button', null, 'Fit canvas to the parts');
    fit.type = 'button';
    fit.addEventListener('click', fitCanvas);
    row.append(fit);
    box.append(row);
  }

  function partProps(box, e) {
    const t = e.t;
    box.append(el('h2', null, ID.types[t]));

    const pos = el('div', 'grid3');
    box.append(pos);
    num(pos, 'X', e, 'x');
    num(pos, 'Y', e, 'y');
    num(pos, 'Rotate°', e, 'r', { step: 5 });

    const size = el('div', 'grid2');
    box.append(size);
    if (t === 'stick' || t === 'dpad' || t === 'lever') {
      num(size, 'Size', e, 'w', { min: 10, also: (v) => (e.h = v) });
    } else if (t === 'label') {
      num(size, 'Text size', e, 'fs', { min: 4, def: 24 });
    } else if (t === 'shape' && e.d) {
      num(size, 'Scale', e, 'sc', { min: 0.05, step: 0.05, def: 1 });
    } else {
      num(size, 'Width', e, 'w', { min: 4 });
      num(size, 'Height', e, 'h', { min: 4 });
    }

    if (t === 'btn') {
      pick(box, 'Shape', e, 'shape', BTN_SHAPES, 'circle');
      const lab = el('div', 'grid2');
      box.append(lab);
      txt(lab, 'Label', e, 'label');
      num(lab, 'Label size', e, 'fs', { min: 4 });
      pick(box, 'Icon', e, 'icon', ICONS);
      bindField(box, 'Input', e, 'bind', 'button');
      check(box, 'Fill up with how far it\'s pressed (analog)', e, 'fill');
    } else if (t === 'stick') {
      bindField(box, 'Left / right axis (bind, then push it right)', e, 'bx', 'axis');
      bindField(box, 'Up / down axis (bind, then push it down)', e, 'by', 'axis');
      bindField(box, 'Click', e, 'bind', 'button');
      const lab = el('div', 'grid2');
      box.append(lab);
      txt(lab, 'Label', e, 'label');
      num(lab, 'Cap size', e, 'cap', { min: 0.2, max: 0.95, step: 0.05, def: 0.6 });
    } else if (t === 'trig') {
      bindField(box, 'Input', e, 'bind', 'trigger');
      pick(box, 'Fills', e, 'dir', [['up', 'Upwards'], ['down', 'Downwards'], ['right', 'Rightwards'], ['left', 'Leftwards']], 'up');
      check(box, 'From the middle (an axis that goes both ways)', e, 'bi');
      const lab = el('div', 'grid2');
      box.append(lab);
      txt(lab, 'Label', e, 'label');
      num(lab, 'Label size', e, 'fs', { min: 4 });
    } else if (t === 'dpad' || t === 'lever') {
      if (t === 'dpad') pick(box, 'Style', e, 'style', [['cross', 'Cross'], ['buttons', 'Four buttons']], 'cross');
      else pick(box, 'Gate', e, 'gate', [['circle', 'Round'], ['square', 'Square'], ['octagon', 'Octagon']], 'circle');
      bindField(box, 'Up', e, 'bu');
      bindField(box, 'Down', e, 'bd');
      bindField(box, 'Left', e, 'bl');
      bindField(box, 'Right', e, 'br');
    } else if (t === 'label') {
      txt(box, 'Text', e, 'label');
    } else if (t === 'shape') {
      if (!e.d) pick(box, 'Shape', e, 'shape', [['round', 'Rounded'], ['rect', 'Square'], ['circle', 'Circle'], ['pill', 'Pill']], 'round');
      const d = el('textarea');
      d.rows = 3;
      d.value = e.d || '';
      d.placeholder = 'Optional: an SVG path, drawn around X, Y';
      d.spellcheck = false;
      wire(d, () => (d.value.trim() ? (e.d = d.value.trim()) : delete e.d));
      d.addEventListener('change', buildProps);
      field(box, 'Path', d);
    }

    const T = ID.resolveTheme(S.opts.theme);
    if (t !== 'shape' && t !== 'label') colorField(box, t === 'lever' ? 'Ball color' : 'Pressed color', e, 'c', T.on);
    if (t !== 'shape' && t !== 'lever') colorField(box, 'Label color', e, 'tc', T.text);
    if (t !== 'label') {
      colorField(box, 'Fill', e, 'f', t === 'shape' ? T.body : T.btn);
      colorField(box, 'Outline', e, 's', '#ffffff');
    }

    const order = el('div', 'row');
    for (const [txtLabel, dir] of [['To front', 'top'], ['Forward', 1], ['Back', -1], ['To back', 'bottom']]) {
      const b = el('button', null, txtLabel);
      b.type = 'button';
      b.addEventListener('click', () => reorder(dir));
      order.append(b);
    }
    box.append(el('div', 'lbl', ''), order);
  }

  // ----------------------------------------------------------------------------------- presets & saving

  function buildPresets() {
    const box = $('#presets');
    box.innerHTML = '';
    let group = null;
    let grid = null;
    for (const p of ID.presets) {
      if (p.group !== group) {
        group = p.group;
        box.append(el('div', 'group-name', group));
        grid = el('div', 'presets');
        box.append(grid);
      }
      const b = el('button', 'preset');
      b.type = 'button';
      b.dataset.preset = p.id;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      ID.render(svg, p.layout, { theme: 'dark' });
      b.append(svg, el('span', null, p.name));
      b.addEventListener('click', function () {
        if (!confirmDiscard()) return;
        openLayout(ID.presetLayout(p.id, input.poll().pad), { preset: p.id });
      });
      grid.append(b);
    }
  }

  function buildSaved() {
    const box = $('#saved');
    box.innerHTML = '';
    const top = el('div', 'row');
    const save = el('button', 'primary', 'Save');
    save.type = 'button';
    save.title = S.savedId ? 'Save over this layout' : 'Add it to My layouts';
    save.addEventListener('click', () => saveLayout(false));
    const saveNew = el('button', null, 'Save as new');
    saveNew.type = 'button';
    saveNew.disabled = !S.savedId;
    saveNew.addEventListener('click', () => saveLayout(true));
    const exp = el('button', null, 'Export .json');
    exp.type = 'button';
    exp.addEventListener('click', exportLayout);
    top.append(save, saveNew, exp);
    box.append(top);
    const ids = Object.keys(saved).sort((a, b) => (saved[b].at || 0) - (saved[a].at || 0));
    if (!ids.length) box.append(el('div', 'empty', 'Saved layouts show up here. They stay in this browser.'));
    for (const id of ids) {
      const row = el('div', 'saved-item');
      const open = el('button', 'open' + (id === S.savedId ? ' current' : ''), saved[id].name || 'Untitled');
      open.type = 'button';
      open.addEventListener('click', function () {
        if (id === S.savedId && !S.dirty) return;
        if (!confirmDiscard()) return;
        openLayout(JSON.parse(JSON.stringify(saved[id].layout)), { saved: id });
      });
      const del = el('button', 'danger', '✕');
      del.type = 'button';
      del.title = 'Delete';
      del.setAttribute('aria-label', 'Delete ' + (saved[id].name || 'Untitled'));
      del.addEventListener('click', function () {
        if (!confirm('Delete "' + (saved[id].name || 'Untitled') + '"?')) return;
        delete saved[id];
        store(SAVED_KEY, saved);
        if (S.savedId === id) {
          S.savedId = null;
          S.dirty = true;
          saveWork();
        }
        buildSaved();
      });
      row.append(open, del);
      box.append(row);
    }
  }

  function saveLayout(asNew) {
    if (!S.layout.name) S.layout.name = 'My layout';
    let id = S.savedId;
    if (!id || asNew) id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    saved[id] = { name: S.layout.name, layout: JSON.parse(JSON.stringify(S.layout)), at: Date.now() };
    if (!store(SAVED_KEY, saved)) return toast("Couldn't save: this browser is blocking storage");
    S.savedId = id;
    S.dirty = false;
    saveWork();
    buildSaved();
    buildProps();
    toast('Saved "' + S.layout.name + '"');
  }

  function exportLayout() {
    const data = JSON.stringify(ID.clean(S.layout), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = (S.layout.name || 'layout').replace(/[^\w-]+/g, '-').toLowerCase() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async function (ev) {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f || !confirmDiscard()) return;
    try {
      let data = JSON.parse(await f.text());
      if (data && data.layout && !data.els) data = data.layout;
      openLayout(ID.validate(data), { dirty: true });
      toast('Imported "' + (S.layout.name || f.name) + '"');
    } catch (err) {
      toast("Couldn't import it: " + (err.message || err));
    }
  });

  $('#newBlank').addEventListener('click', function () {
    if (!confirmDiscard()) return;
    openLayout({ name: 'My layout', w: 1000, h: 560, els: [] }, { dirty: true });
  });

  function markCurrent() {
    document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('current', b.dataset.preset === S.preset));
    buildSaved();
  }

  // ------------------------------------------------------------------------------------------- the link

  const themeSel = $('#optTheme');
  for (const k in ID.themes) {
    const o = el('option', null, ID.themes[k].label);
    o.value = k;
    themeSel.append(o);
  }
  function showOpts() {
    themeSel.value = S.opts.theme;
    $('#optColors').checked = S.opts.colors;
    $('#optGlow').checked = S.opts.glow;
    $('#optBody').checked = S.opts.body;
    $('#optPad').value = S.opts.pad;
    $('#optIdle').value = S.opts.idle || 0;
  }
  function optChanged() {
    store(OPTS_KEY, S.opts);
    applyPadOpt();
    drawCanvas();
    if (S.sel >= 0) buildProps();
    scheduleUrl();
  }
  themeSel.addEventListener('change', function () {
    S.opts.theme = themeSel.value;
    S.opts.glow = !!ID.themes[S.opts.theme].glow;
    showOpts();
    optChanged();
  });
  $('#optColors').addEventListener('change', (ev) => ((S.opts.colors = ev.target.checked), optChanged()));
  $('#optGlow').addEventListener('change', (ev) => ((S.opts.glow = ev.target.checked), optChanged()));
  $('#optBody').addEventListener('change', (ev) => ((S.opts.body = ev.target.checked), optChanged()));
  $('#optPad').addEventListener('change', (ev) => ((S.opts.pad = ev.target.value), optChanged()));
  $('#optIdle').addEventListener('input', (ev) => ((S.opts.idle = Math.max(0, parseFloat(ev.target.value) || 0)), optChanged()));

  let urlTimer = 0;
  let urlSeq = 0;
  function scheduleUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(buildUrl, 150);
  }
  async function buildUrl() {
    const seq = ++urlSeq;
    const p = new URLSearchParams();
    if (S.preset) p.set('layout', S.preset);
    else p.set('l', await ID.encodeLayout(S.layout));
    if (seq !== urlSeq) return;
    const o = S.opts;
    if (o.theme !== 'dark') p.set('theme', o.theme);
    if (!o.colors) p.set('colors', '0');
    if (o.glow !== !!ID.themes[o.theme].glow) p.set('glow', o.glow ? '1' : '0');
    if (!o.body) p.set('body', '0');
    if (o.pad !== 'auto') p.set('pad', o.pad);
    if (o.idle > 0) p.set('idle', o.idle);
    const url = new URL('overlay.html', location.href);
    url.search = p.toString();
    $('#url').value = url.href;
    const L = S.layout;
    $('#sizeNote').textContent = 'Make the source ' + Math.round(L.w) + ' × ' + Math.round(L.h) +
      ' or any size of that shape; it scales to fit.' + (S.preset === 'raw' ? ' The overlay adapts this one to whatever controller it sees.' : '');
  }

  $('#copyUrl').addEventListener('click', async function () {
    const u = $('#url');
    try {
      await navigator.clipboard.writeText(u.value);
    } catch (e) {
      u.select();
      document.execCommand('copy');
    }
    toast('Link copied');
  });
  $('#openUrl').addEventListener('click', () => window.open($('#url').value, '_blank', 'noopener'));

  // ------------------------------------------------------------------------------------ live controller

  const status = $('#padStatus');
  const padName = $('#padName');
  const readout = $('#readout');
  let shown = '';
  let chips = null;
  let rest = null;
  let held = new Set();
  let lastIn = '';
  let rawShape = '';

  function showPad(st) {
    const p = st.pad;
    const key = p ? p.index + p.id + p.mapping : '';
    if (key === shown) return;
    shown = key;
    status.classList.toggle('on', !!p);
    if (!p) {
      padName.textContent = 'No controller yet. Press a button on it.';
      status.title = '';
    } else {
      padName.textContent = 'Controller ' + (p.index + 1) + ': ' + p.id;
      status.title = p.id + (p.mapping === 'standard' ? ' (standard mapping)' : ' (no standard mapping: the presets may need rebinding)');
    }
    buildReadout(p);
  }

  function buildReadout(p) {
    readout.innerHTML = '';
    chips = null;
    rest = p ? p.axes.slice() : null;
    held = new Set();
    lastIn = '';
    if (!p) {
      readout.append(el('div', null, 'Browsers only see a controller once one of its buttons is pressed.'));
      return;
    }
    const top = el('div');
    const map = el('span', null, p.mapping === 'standard' ? 'Standard mapping. ' : 'No standard mapping, so the presets may need rebinding. ');
    const last = el('b', null, '');
    top.append(map, document.createTextNode('Last input: '), last);
    const bRow = el('div', 'chips');
    bRow.append(el('span', null, 'Buttons'));
    const b = p.buttons.map(function (_, i) {
      const c = el('span', 'chip', String(i));
      bRow.append(c);
      return c;
    });
    const aRow = el('div', 'chips');
    aRow.append(el('span', null, 'Axes'));
    const a = p.axes.map(function () {
      const c = el('span', 'chip', '');
      aRow.append(c);
      return c;
    });
    readout.append(top, bRow, aRow);
    chips = { b: b, a: a, last: last, bv: [], av: [] };
  }

  // the input that just started, as a binding, for the "Last input" readout
  function heldNow(st) {
    const now = new Set();
    st.buttons.forEach((v, i) => v >= 0.5 && now.add('b' + i));
    st.axes.forEach(function (v, i) {
      const r0 = rest[i] == null ? 0 : rest[i];
      if (r0 > 1.02) {
        const k = ID.hatDir(v);
        if (k >= 0) for (const d of 'udlr') if ({ u: [7, 0, 1], r: [1, 2, 3], d: [3, 4, 5], l: [5, 6, 7] }[d].indexOf(k) >= 0) now.add('h' + i + d);
      } else if (Math.abs(v - r0) > 0.6) now.add('a' + i + (r0 < -0.8 ? '~' : v > r0 ? '+' : '-'));
    });
    return now;
  }

  function updateReadout(st) {
    if (!chips || !st.pad) return;
    st.buttons.forEach(function (v, i) {
      const on = v >= 0.5;
      if (chips.b[i] && chips.bv[i] !== on) {
        chips.bv[i] = on;
        chips.b[i].classList.toggle('on', on);
      }
    });
    st.axes.forEach(function (v, i) {
      const t = v > 1.02 ? 'hat' : (v >= 0 ? ' ' : '') + v.toFixed(2);
      if (chips.a[i] && chips.av[i] !== t) {
        chips.av[i] = t;
        chips.a[i].textContent = i + ': ' + t;
        chips.a[i].classList.toggle('on', ID.hatDir(v) >= 0 && rest[i] > 1.02 ? true : Math.abs(v - (rest[i] || 0)) > 0.5);
      }
    });
    const now = heldNow(st);
    for (const k of now) if (!held.has(k)) lastIn = k;
    held = now;
    if (chips.last.textContent !== lastIn) chips.last.textContent = lastIn || '(none yet)';
  }

  function frame() {
    const st = input.poll();
    // the All inputs preset follows the controller while it's unchanged
    if (S.preset === 'raw' && st.pad) {
      const shape = st.pad.buttons.length + '/' + st.pad.axes.map((v) => (v > 1.02 ? 'h' : 'a')).join('');
      if (shape !== rawShape) {
        rawShape = shape;
        S.layout = ID.presetLayout('raw', st.pad);
        S.sel = -1;
        drawCanvas();
        buildProps();
        scheduleUrl();
      }
    }
    if (view) view.update(st);
    if (!drag && S.sel >= 0 && view && (S.layout.els[S.sel].t === 'stick' || S.layout.els[S.sel].t === 'lever')) drawSelection();
    showPad(st);
    updateReadout(st);
    checkCapture();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------------------------- start

  buildPresets();
  showOpts();
  const work = load(WORK_KEY, null);
  let opened = false;
  if (work && work.preset && !work.dirty && ID.preset(work.preset)) {
    // an unchanged preset opens fresh, so it picks up any improvements to the preset itself
    openLayout(ID.presetLayout(work.preset), { preset: work.preset });
    opened = true;
  } else if (work && work.layout) {
    try {
      openLayout(ID.validate(work.layout), { preset: work.preset, saved: work.savedId && saved[work.savedId] ? work.savedId : null,
        dirty: work.dirty });
      opened = true;
    } catch (e) {}
  }
  if (!opened) openLayout(ID.presetLayout('xbox'), { preset: 'xbox' });
  requestAnimationFrame(frame);
})();
