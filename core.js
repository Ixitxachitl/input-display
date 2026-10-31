/*
  Input Display: shared core
  --------------------------
  Themes, bindings, controller input (Gamepad API + keyboard) and the SVG renderer. Used by overlay.html (the
  browser source) and index.html (the editor). A plain script, no modules, so both pages also work from disk.

  A layout is { name, w, h, sw?, els: [...] }: a w × h canvas (the SVG viewBox, so it scales to any size) and a
  list of elements drawn in order. Every element has a type t, a centre x, y and an optional rotation r:

    btn    button: w, h, shape (circle | round | rect | pill | path, which draws d around x, y), label or icon,
           bind; fill: true shows how far an analog button is pressed
    stick  thumbstick: w, bx and by (its axes), bind (clicking it), cap (cap size, 0–1)
    trig   analog bar: w, h, bind, dir (up | down | left | right: which way it fills), bi: true for a -1…1 axis;
           d: a path around x, y to draw it as instead of a rounded bar (w and h still set how it fills)
    dpad   d-pad: w, bu bd bl br (one binding per direction), style (cross | buttons)
    lever  arcade stick: w, bu bd bl br, gate (circle | square | octagon)
    label  text: label, fs
    shape  decoration (controller bodies, panels): d (an SVG path around x, y) and sc, or shape, w and h;
           inset: true draws it as a shaded recess

  Any element can have c (its pressed / accent color), tc (its label color), f and s (fill and outline), and lx, ly
  to move its label off the centre.
*/
(function () {
  'use strict';
  const ID = (window.InputDisplay = window.InputDisplay || {});
  const NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------------------------------------- themes

  ID.themes = {
    dark: { label: 'Dark', body: '#15171e', bodyOp: 0.88, bodyLine: '#ffffff30', btn: '#2a2e3a', line: '#ffffff40',
      text: '#d9dce6', on: '#ffffff', onText: '#111318', glow: false },
    light: { label: 'Light', body: '#eef0f5', bodyOp: 0.95, bodyLine: '#00000030', btn: '#ffffff', line: '#00000035',
      text: '#3a3f4d', on: '#2a2e3a', onText: '#ffffff', glow: false },
    outline: { label: 'Outline', body: 'none', bodyOp: 1, bodyLine: '#ffffffb0', btn: 'none', line: '#ffffffd0',
      text: '#ffffff', on: '#ffffff', onText: '#111318', glow: false },
    neon: { label: 'Neon', body: '#0c0a1a', bodyOp: 0.85, bodyLine: '#b06cff80', btn: '#17132c', line: '#7c5cff99',
      text: '#cbbcff', on: '#00f0ff', onText: '#0c0a1a', glow: true },
    ghost: { label: 'Ghost', body: '#000000', bodyOp: 0.3, bodyLine: '#ffffff20', btn: '#ffffff14', line: '#ffffff50',
      text: '#ffffffc0', on: '#ffffff', onText: '#111318', glow: false },
  };

  ID.resolveTheme = function (name, over) {
    const t = Object.assign({}, ID.themes[name] || ID.themes.dark);
    for (const k in over || {}) if (over[k] != null && over[k] !== '') t[k] = over[k];
    return t;
  };

  // -------------------------------------------------------------------------------------------- bindings
  // A binding is one or more inputs separated by "|"; the element reads the strongest of them.
  //   b6       button 6 (its analog value, 0–1)
  //   a1+ a1-  one half of axis 1 (0–1)
  //   a5~      all of axis 5, -1…1 read as 0…1 (a trigger that's an axis)
  //   a0       axis 0 as it is, -1…1 (for sticks); a leading ! flips it, e.g. !a1
  //   h9u      a POV hat on axis 9: u, d, l or r (diagonals count for both)
  //   k:KeyZ   a key (only while the page has focus, so never inside OBS)

  const parsed = new Map();
  function parse(s) {
    s = s == null ? '' : String(s);
    let terms = parsed.get(s);
    if (terms) return terms;
    terms = [];
    for (const raw of s.split('|')) {
      const p = raw.trim();
      let m;
      if ((m = /^k:(\w+)$/.exec(p))) terms.push({ k: 'key', code: m[1] });
      else if ((m = /^b(\d+)$/.exec(p))) terms.push({ k: 'b', i: +m[1] });
      else if ((m = /^(!?)a(\d+)([+~-]?)$/.exec(p))) terms.push({ k: 'a', i: +m[2], m: m[3], inv: !!m[1] });
      else if ((m = /^h(\d+)([udlr])$/.exec(p))) terms.push({ k: 'h', i: +m[1], d: m[2] });
    }
    if (parsed.size > 2000) parsed.clear();
    parsed.set(s, terms);
    return terms;
  }
  ID.parseBind = parse;

  // Chrome reports a DirectInput POV hat as one axis: -1 is up, then every 2/7 one step clockwise round to
  // up-left at 1, and about 1.29 when it's let go. Returns 0–7 (0 = up, 2 = right…), or -1 for neutral or
  // anything that isn't one of those exact steps (so an ordinary axis resting at 0 never reads as a hat).
  ID.hatDir = function (v) {
    if (!(v >= -1.02 && v <= 1.02)) return -1;
    const k = Math.round((v + 1) * 3.5);
    return Math.abs(-1 + (k * 2) / 7 - v) < 0.04 ? k % 8 : -1;
  };
  const HAT_HITS = { u: [7, 0, 1], r: [1, 2, 3], d: [3, 4, 5], l: [5, 6, 7] };

  function termVal(t, st) {
    if (t.k === 'key') return st.keys && st.keys.has(t.code) ? 1 : 0;
    if (t.k === 'b') return st.buttons[t.i] || 0;
    let v = st.axes[t.i];
    if (v == null) return 0;
    if (t.k === 'h') return HAT_HITS[t.d].indexOf(ID.hatDir(v)) >= 0 ? 1 : 0;
    if (t.inv) v = -v;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    if (t.m === '+') return v > 0 ? v : 0;
    if (t.m === '-') return v < 0 ? -v : 0;
    if (t.m === '~') return (v + 1) / 2;
    return Math.abs(v);
  }

  // 0…1: how hard a binding is pressed
  ID.value = function (s, st) {
    let m = 0;
    for (const t of parse(s)) {
      const v = termVal(t, st);
      if (v > m) m = v;
    }
    return m > 1 ? 1 : m;
  };

  // -1…1: a binding read as an axis (plain axes keep their sign, anything else counts as positive)
  ID.axis = function (s, st) {
    let best = 0;
    for (const t of parse(s)) {
      let v;
      if (t.k === 'a' && !t.m) {
        v = st.axes[t.i];
        if (v == null) continue;
        if (t.inv) v = -v;
      } else v = termVal(t, st);
      if (Math.abs(v) > Math.abs(best)) best = v;
    }
    return best > 1 ? 1 : best < -1 ? -1 : best;
  };

  ID.EMPTY = { pad: null, buttons: [], axes: [], keys: new Set() };

  // --------------------------------------------------------------------------------------------- input
  // Polls the Gamepad API. pad is 'auto' (whichever controller was used last) or a controller index.
  // Browsers only show a controller to a page once one of its buttons has been pressed.

  ID.Input = function (opts) {
    opts = opts || {};
    this.pad = opts.pad == null ? 'auto' : opts.pad;
    this.keys = new Set();
    this.active = -1;
    this.prev = [];
    this.lastMove = 0;
    if (opts.keys !== false) {
      const keys = this.keys;
      const self = this;
      addEventListener('keydown', function (e) {
        if (!e.repeat) self.lastMove = performance.now();
        keys.add(e.code);
      });
      addEventListener('keyup', function (e) {
        keys.delete(e.code);
      });
      addEventListener('blur', function () {
        keys.clear();
      });
    }
  };

  ID.Input.prototype.pads = function () {
    try {
      return Array.prototype.filter.call(navigator.getGamepads ? navigator.getGamepads() : [], Boolean);
    } catch (e) {
      return [];
    }
  };

  ID.Input.prototype.poll = function () {
    const pads = this.pads();
    const now = performance.now();
    for (const p of pads) {
      const prev = this.prev[p.index];
      const b = p.buttons.map(btnValue);
      const a = p.axes.slice();
      if (prev && moved(prev, b, a)) {
        this.lastMove = now;
        this.active = p.index;
      }
      this.prev[p.index] = { b: b, a: a };
    }
    let pick = null;
    if (this.pad === 'auto') pick = pads.find((p) => p.index === this.active) || pads[0] || null;
    else pick = pads.find((p) => p.index === +this.pad) || null;
    const cur = pick && this.prev[pick.index];
    return {
      pad: pick,
      buttons: cur ? cur.b : [],
      axes: cur ? cur.a : [],
      keys: this.keys,
      pads: pads,
    };
  };

  function btnValue(b) {
    return b.value || (b.pressed ? 1 : 0);
  }
  function moved(prev, b, a) {
    for (let i = 0; i < b.length; i++) if (Math.abs(b[i] - (prev.b[i] || 0)) > 0.3) return true;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - (prev.a[i] || 0)) > 0.3) return true;
    return false;
  }

  // A pretend controller for demos and screenshots: sticks circling, triggers squeezing, and buttons and the d-pad
  // pressed in short combos, all worked out from the time (ms) so it needs no state.
  const DEMO_STEPS = [[13], [13, 15], [15, 2], [], [14], [13], [13, 14], [14, 1], [], [12], [0], [3], [],
    [5], [4, 0], [], [15], [15, 13], [13, 3], [], [2], [2, 1], [], [16], [], [12, 15], [7], [], [8], [9], []];
  ID.demoState = function (ms) {
    const t = ms / 1000;
    const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.37));
    const buttons = [];
    for (let i = 0; i < 18; i++) buttons.push(0);
    for (const i of DEMO_STEPS[Math.floor(t / 0.24) % DEMO_STEPS.length]) buttons[i] = 1;
    buttons[6] = Math.max(buttons[6], Math.max(0, Math.sin(t * 1.1)));
    buttons[7] = Math.max(buttons[7], Math.max(0, Math.sin(t * 0.83 + 2)));
    const axes = [Math.cos(t * 1.4) * a, Math.sin(t * 1.4) * a, Math.sin(t * 1.1) * 0.9, Math.sin(t * 2.2) * 0.6];
    return {
      pad: { id: 'Demo controller', index: 0, mapping: 'standard', buttons: buttons, axes: axes },
      buttons: buttons, axes: axes, keys: new Set(), pads: [],
    };
  };

  // What changed between two snapshots of one controller, as a binding: a button pressed, a hat pushed, or an
  // axis moved a good way from where it was. kind 'axis' gives a whole axis (a0, or !a1 when it went the
  // negative way), 'trigger' reads an axis resting at -1 as a~, anything else gives an axis half.
  ID.detect = function (base, cur, kind) {
    for (let i = 0; i < cur.b.length; i++) if ((base.b[i] || 0) < 0.5 && cur.b[i] >= 0.5) return 'b' + i;
    for (let i = 0; i < cur.a.length; i++) {
      const v = cur.a[i];
      const b0 = base.a[i] == null ? 0 : base.a[i];
      if (b0 > 1.02) {
        const k = ID.hatDir(v);
        if (k >= 0 && k % 2 === 0) return 'h' + i + 'urdl'[k / 2];
        continue;
      }
      if (Math.abs(v - b0) < 0.6) continue;
      if (kind === 'axis') return (v < b0 ? '!a' : 'a') + i;
      if (kind === 'trigger' && b0 < -0.8) return 'a' + i + '~';
      return 'a' + i + (v > b0 ? '+' : '-');
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------ rendering

  let uid = 0;
  function mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  ID.mk = mk;

  function shape(kind, w, h, attrs, parent) {
    if (kind === 'circle') return mk('ellipse', Object.assign({ cx: 0, cy: 0, rx: w / 2, ry: h / 2 }, attrs), parent);
    const m = Math.min(w, h);
    const rx = kind === 'pill' ? m / 2 : kind === 'rect' ? m * 0.06 : m * 0.28;
    return mk('rect', Object.assign({ x: -w / 2, y: -h / 2, width: w, height: h, rx: rx }, attrs), parent);
  }

  // Icons on a -1…1 square: stroked unless fill is set
  ID.icons = {
    cross: { d: 'M-.68-.68L.68.68M.68-.68L-.68.68' },
    circle: { d: 'M0-.7A.7.7 0 1 1 0 .7A.7.7 0 1 1 0-.7Z' },
    square: { d: 'M-.64-.64H.64V.64H-.64Z' },
    triangle: { d: 'M0-.74L.74.54H-.74Z' },
    up: { d: 'M0-.7L.72.5H-.72Z', fill: true },
    down: { d: 'M0 .7L.72-.5H-.72Z', fill: true },
    left: { d: 'M-.7 0L.5-.72V.72Z', fill: true },
    right: { d: 'M.7 0L-.5-.72V.72Z', fill: true },
    plus: { d: 'M0-.7V.7M-.7 0H.7' },
    minus: { d: 'M-.7 0H.7' },
    menu: { d: 'M-.62-.45H.62M-.62 0H.62M-.62.45H.62' },
    view: { d: 'M-.7-.2H.2V.62H-.7ZM-.3-.62H.62V.2' },
    home: { d: 'M-.72.02L0-.66L.72.02M-.5-.16V.64H.5V-.16' },
    capture: { d: 'M-.62-.62H.62V.62H-.62ZM0-.32A.32.32 0 1 1 0 .32A.32.32 0 1 1 0-.32Z' },
    star: { d: 'M0-.75L.22-.24L.75-.22L.34.12L.47.66L0 .36L-.47.66L-.34.12L-.75-.22L-.22-.24Z', fill: true },
  };

  function icon(name, size, color, parent, at) {
    const ic = ID.icons[name];
    if (!ic) return null;
    return mk('path', {
      d: ic.d,
      transform: (at ? 'translate(' + at[0] + ' ' + at[1] + ') ' : '') + 'scale(' + size + ')',
      fill: ic.fill ? color : 'none',
      stroke: ic.fill ? 'none' : color,
      'stroke-width': 0.17,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, parent);
  }

  // The label or icon on a button; returns a function that recolors it for pressed / not pressed
  function face(e, w, h, T, c, g) {
    const col = c.tcol(e);
    const m = Math.min(w, h);
    let el = null;
    let attr = 'fill';
    if (e.icon && ID.icons[e.icon]) {
      el = icon(e.icon, m * (e.is || 0.3), col, g);
      if (!ID.icons[e.icon].fill) attr = 'stroke';
    } else if (e.label) {
      el = mk('text', { x: e.lx || 0, y: e.ly || 0, 'font-size': e.fs || Math.round(m * 0.42), fill: col, 'text-anchor': 'middle',
        'dominant-baseline': 'central' }, g);
      el.textContent = e.label;
    }
    return function (on) {
      if (el) el.setAttribute(attr, on ? T.onText : col);
    };
  }

  function clipRect(c, target) {
    const id = c.pre + 'c' + ++uid;
    const cp = mk('clipPath', { id: id }, c.defs);
    target.setAttribute('clip-path', 'url(#' + id + ')');
    return mk('rect', { x: 0, y: 0, width: 0, height: 0 }, cp);
  }

  function setRect(r, x, y, w, h) {
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', Math.max(0, w));
    r.setAttribute('height', Math.max(0, h));
  }

  const B = {};

  B.btn = function (e, g, T, c) {
    const w = e.w || 60;
    const h = e.h || w;
    const kind = e.shape || 'circle';
    const sw = c.sw;
    const draw = (attrs) => kind === 'path' && e.d
      ? mk('path', Object.assign({ d: e.d, 'stroke-linejoin': 'round' }, attrs), g)
      : shape(kind, w, h, attrs, g);
    draw({ fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': sw });
    const acc = c.acc(e);
    const lit = draw({ fill: acc, stroke: acc, 'stroke-width': sw, opacity: 0, filter: c.glow });
    const clip = e.fill ? clipRect(c, lit) : null;
    const setFace = face(e, w, h, T, c, g);
    let last = -1;
    return function (st) {
      const v = c.val(e.bind, st);
      const key = e.fill ? Math.round(v * 100) : v >= 0.5 ? 1 : 0;
      if (key === last) return;
      last = key;
      if (clip) {
        const full = h + sw * 2;
        setRect(clip, -w / 2 - sw, h / 2 + sw - full * v, w + sw * 2, full * v);
        lit.setAttribute('opacity', v > 0.02 ? 1 : 0);
      } else lit.setAttribute('opacity', key);
      setFace(v >= 0.5);
    };
  };

  B.stick = function (e, g, T, c) {
    const w = e.w || 110;
    const R = w / 2;
    const capR = R * (e.cap || 0.6);
    const th = R * 0.5;
    const acc = c.acc(e);
    mk('circle', { r: R, fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': c.sw }, g);
    mk('circle', { r: R * 0.8, fill: 'none', stroke: T.line, 'stroke-width': c.sw * 0.7, opacity: 0.45 }, g);
    const line = mk('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: acc, 'stroke-width': R * 0.1, 'stroke-linecap': 'round',
      opacity: 0.55 }, g);
    const cap = mk('g', {}, g);
    mk('circle', { r: capR, fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': c.sw }, cap);
    const lit = mk('circle', { r: capR, fill: acc, stroke: acc, 'stroke-width': c.sw, opacity: 0, filter: c.glow }, cap);
    mk('circle', { r: capR * 0.7, fill: 'none', stroke: T.line, 'stroke-width': c.sw * 0.7, opacity: 0.6 }, cap);
    const setFace = face(e, capR * 2, capR * 2, T, c, cap);
    let last = '';
    return function (st) {
      let x = c.axis(e.bx, st);
      let y = c.axis(e.by, st);
      const m = Math.hypot(x, y);
      if (m < c.dz) x = y = 0;
      else {
        // rescale past the deadzone so the cap still reaches the edge, and keep it inside the circle
        const k = Math.min(1, (m - c.dz) / (1 - c.dz)) / m;
        x *= k;
        y *= k;
      }
      const on = c.val(e.bind, st) >= 0.5;
      const px = Math.round(x * th * 2) / 2;
      const py = Math.round(y * th * 2) / 2;
      const key = px + ',' + py + (on ? '!' : '');
      if (key === last) return;
      last = key;
      cap.setAttribute('transform', 'translate(' + px + ' ' + py + ')');
      line.setAttribute('x2', px);
      line.setAttribute('y2', py);
      lit.setAttribute('opacity', on ? 1 : 0);
      setFace(on);
    };
  };

  B.trig = function (e, g, T, c) {
    const w = e.w || 140;
    const h = e.h || 50;
    const dir = e.dir || 'up';
    const sw = c.sw;
    const rx = Math.min(w, h) * 0.22;
    const acc = c.acc(e);
    const draw = (attrs) => e.d
      ? mk('path', Object.assign({ d: e.d, 'stroke-linejoin': 'round' }, attrs), g)
      : mk('rect', Object.assign({ x: -w / 2, y: -h / 2, width: w, height: h, rx: rx }, attrs), g);
    draw({ fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': sw });
    const lit = draw({ fill: acc, stroke: acc, 'stroke-width': sw, filter: c.glow });
    const clip = clipRect(c, lit);
    if (e.bi) mk('line', dir === 'left' || dir === 'right'
      ? { x1: 0, x2: 0, y1: -h / 2, y2: h / 2, stroke: T.line, 'stroke-width': sw }
      : { y1: 0, y2: 0, x1: -w / 2, x2: w / 2, stroke: T.line, 'stroke-width': sw }, g);
    const setFace = face(e, w, h, T, c, g);
    const W = w + sw * 2;
    const H = h + sw * 2;
    const x0 = -W / 2;
    const y0 = -H / 2;
    let last = NaN;
    return function (st) {
      let v = e.bi ? c.axis(e.bind, st) : c.val(e.bind, st);
      v = Math.round(v * 200) / 200;
      if (v === last) return;
      last = v;
      const horiz = dir === 'left' || dir === 'right';
      const sgn = dir === 'up' || dir === 'left' ? -1 : 1;
      if (e.bi) {
        // fills from the middle, towards dir for positive values
        const a = v * sgn;
        if (horiz) setRect(clip, a < 0 ? (a * W) / 2 : 0, y0, (Math.abs(a) * W) / 2, H);
        else setRect(clip, x0, a < 0 ? (a * H) / 2 : 0, W, (Math.abs(a) * H) / 2);
      } else if (dir === 'up') setRect(clip, x0, -y0 - H * v, W, H * v);
      else if (dir === 'down') setRect(clip, x0, y0, W, H * v);
      else if (dir === 'right') setRect(clip, x0, y0, W * v, H);
      else setRect(clip, -x0 - W * v, y0, W * v, H);
      setFace(Math.abs(v) >= 0.5);
    };
  };

  B.dpad = function (e, g, T, c) {
    const w = e.w || 120;
    const H = w / 2;
    const a = (w * (e.arm || 0.34)) / 2;
    const acc = c.acc(e);
    const col = c.tcol(e);
    const sw = c.sw;
    const parts = {};
    const ROT = { bu: 0, br: 90, bd: 180, bl: 270 };
    if (e.style === 'buttons') {
      // four separate pads pointing at the middle
      const b = a * 0.86;
      const d = 'M' + -b + ',' + -H + 'H' + b + 'V' + -a * 1.3 + 'L0,' + -a * 0.45 + 'L' + -b + ',' + -a * 1.3 + 'Z';
      for (const k in ROT) {
        const pg = mk('g', { transform: 'rotate(' + ROT[k] + ')' }, g);
        mk('path', { d: d, fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': sw, 'stroke-linejoin': 'round' }, pg);
        const lit = mk('path', { d: d, fill: acc, stroke: acc, 'stroke-width': sw, 'stroke-linejoin': 'round', opacity: 0,
          filter: c.glow }, pg);
        const ar = icon('up', a * 0.4, col, pg, [0, -(H + a * 1.3) / 2]);
        parts[k] = [lit, ar];
      }
    } else {
      const cross = 'M' + -a + ',' + -H + 'H' + a + 'V' + -a + 'H' + H + 'V' + a + 'H' + a + 'V' + H + 'H' + -a + 'V' + a +
        'H' + -H + 'V' + -a + 'H' + -a + 'Z';
      mk('path', { d: cross, fill: e.f || T.btn }, g);
      for (const k in ROT) {
        const pg = mk('g', { transform: 'rotate(' + ROT[k] + ')' }, g);
        const lit = mk('rect', { x: -a, y: -H, width: a * 2, height: H - a, fill: acc, opacity: 0, filter: c.glow }, pg);
        parts[k] = [lit, null];
      }
      mk('circle', { r: a * 0.45, fill: 'none', stroke: T.line, 'stroke-width': sw * 0.7, opacity: 0.5 }, g);
      mk('path', { d: cross, fill: 'none', stroke: e.s || T.line, 'stroke-width': sw, 'stroke-linejoin': 'round' }, g);
      for (const k in ROT) {
        const pg = mk('g', { transform: 'rotate(' + ROT[k] + ')' }, g);
        parts[k][1] = icon('up', a * 0.42, col, pg, [0, -(H + a) / 2]);
      }
    }
    const last = {};
    return function (st) {
      for (const k in parts) {
        const on = c.val(e[k], st) >= 0.5;
        if (last[k] === on) continue;
        last[k] = on;
        parts[k][0].setAttribute('opacity', on ? 1 : 0);
        if (parts[k][1]) parts[k][1].setAttribute('fill', on ? T.onText : col);
      }
    };
  };

  B.lever = function (e, g, T, c) {
    const w = e.w || 180;
    const R = w / 2;
    const gate = e.gate || 'circle';
    const sw = c.sw;
    const ball = c.acc(e);
    mk('circle', { r: R, fill: e.f || T.btn, stroke: e.s || T.line, 'stroke-width': sw }, g);
    const G = R * 0.62;
    const gateAttrs = { fill: 'none', stroke: T.line, 'stroke-width': sw, opacity: 0.6, 'stroke-linejoin': 'round' };
    if (gate === 'square') mk('rect', Object.assign({ x: -G, y: -G, width: G * 2, height: G * 2, rx: G * 0.12 }, gateAttrs), g);
    else if (gate === 'octagon') {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const t = ((i + 0.5) * Math.PI) / 4;
        pts.push((Math.cos(t) * G * 1.08).toFixed(1) + ',' + (Math.sin(t) * G * 1.08).toFixed(1));
      }
      mk('polygon', Object.assign({ points: pts.join(' ') }, gateAttrs), g);
    } else mk('circle', Object.assign({ r: G }, gateAttrs), g);
    mk('circle', { r: R * 0.13, fill: T.line }, g);
    const shaft = mk('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: T.text, 'stroke-width': R * 0.11, 'stroke-linecap': 'round',
      opacity: 0.7 }, g);
    const top = mk('g', {}, g);
    const br = R * 0.36;
    mk('circle', { r: br, fill: ball, stroke: e.s || T.line, 'stroke-width': sw, filter: c.glow }, top);
    mk('circle', { cx: -br * 0.32, cy: -br * 0.32, r: br * 0.34, fill: '#ffffff', opacity: 0.35 }, top);
    const th = R * 0.46;
    let last = '';
    return function (st) {
      let x = c.val(e.br, st) - c.val(e.bl, st);
      let y = c.val(e.bd, st) - c.val(e.bu, st);
      if (Math.abs(x) < c.dz) x = 0;
      if (Math.abs(y) < c.dz) y = 0;
      const m = Math.hypot(x, y);
      // a square gate lets it go all the way into the corners; round and octagonal ones don't
      if (gate !== 'square' && m > 1) {
        x /= m;
        y /= m;
      }
      const px = Math.round(x * th);
      const py = Math.round(y * th);
      const key = px + ',' + py;
      if (key === last) return;
      last = key;
      top.setAttribute('transform', 'translate(' + px + ' ' + py + ')');
      shaft.setAttribute('x2', px);
      shaft.setAttribute('y2', py);
    };
  };

  B.label = function (e, g, T, c) {
    const t = mk('text', { x: 0, y: 0, 'font-size': e.fs || 24, fill: c.tcol(e), 'text-anchor': 'middle',
      'dominant-baseline': 'central' }, g);
    t.textContent = e.label == null ? 'Text' : e.label;
  };

  B.shape = function (e, g, T, c) {
    const sc = e.d && e.sc ? e.sc : 1;
    // inset: a recess in the body (a well round a d-pad, a faceplate, a stick gate), shaded rather than filled
    const attrs = e.inset
      ? { fill: e.f || '#000000', 'fill-opacity': e.f ? 1 : 0.32, stroke: e.s || T.bodyLine,
        'stroke-width': c.sw / sc, 'stroke-linejoin': 'round' }
      : { fill: e.f || T.body, 'fill-opacity': e.f ? 1 : T.bodyOp, stroke: e.s || T.bodyLine,
        'stroke-width': c.sw / sc, 'stroke-linejoin': 'round' };
    if (e.d) mk('path', Object.assign({ d: e.d }, attrs), g);
    else shape(e.shape || 'round', e.w || 300, e.h || 180, attrs, g);
  };

  ID.types = {
    btn: 'Button', stick: 'Stick', trig: 'Trigger', dpad: 'D-pad', lever: 'Arcade stick', label: 'Label', shape: 'Shape',
  };

  ID.transformOf = function (e) {
    let s = 'translate(' + (e.x || 0) + ' ' + (e.y || 0) + ')';
    if (e.r) s += ' rotate(' + e.r + ')';
    if (e.t === 'shape' && e.d && e.sc && e.sc !== 1) s += ' scale(' + e.sc + ')';
    return s;
  };

  // Draws a layout into an <svg>, replacing what's there. Options:
  //   theme   theme name (default dark)        over    theme colors to override, e.g. { on: '#ff0' }
  //   colors  false = ignore each button's own colors      glow   true / false (default: the theme's)
  //   body    false = leave out the shapes (controller bodies)   dz   stick deadzone, 0–1 (default 0.1)
  // Returns { root, groups, theme, update(state) }.
  ID.render = function (svg, layout, o) {
    o = o || {};
    const T = ID.resolveTheme(o.theme, o.over);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + layout.w + ' ' + layout.h);
    svg.style.fontFamily = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    svg.style.fontWeight = '700';
    const defs = mk('defs', {}, svg);
    const pre = 'id' + ++uid;
    let glow = null;
    if (o.glow != null ? o.glow : T.glow) {
      const f = mk('filter', { id: pre + 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
      mk('feGaussianBlur', { stdDeviation: 7, result: 'b' }, f);
      const m = mk('feMerge', {}, f);
      mk('feMergeNode', { in: 'b' }, m);
      mk('feMergeNode', { in: 'SourceGraphic' }, m);
      glow = 'url(#' + pre + 'glow)';
    }
    const colors = o.colors !== false;
    const ctx = {
      T: T, defs: defs, pre: pre, glow: glow, sw: layout.sw || 3, dz: o.dz == null ? 0.1 : o.dz,
      val: ID.value, axis: ID.axis,
      acc: function (e) { return (colors && e.c) || T.on; },
      tcol: function (e) { return (colors && e.tc) || T.text; },
    };
    const root = mk('g', {}, svg);
    const ups = [];
    const groups = [];
    layout.els.forEach(function (e, i) {
      if (!B[e.t] || (e.t === 'shape' && o.body === false)) return;
      const g = mk('g', { transform: ID.transformOf(e), 'data-i': i }, root);
      groups[i] = g;
      const u = B[e.t](e, g, T, ctx);
      if (u) ups.push(u);
    });
    function update(st) {
      for (let i = 0; i < ups.length; i++) ups[i](st);
    }
    update(ID.EMPTY);
    return { root: root, groups: groups, theme: T, update: update };
  };

  // -------------------------------------------------------------------------------------- the raw layout
  // Every button and axis a controller has, for checking what it sends. Axes that look like a POV hat get a
  // d-pad; the first two pairs of axes also get sticks.
  ID.rawLayout = function (pad) {
    const nb = pad ? pad.buttons.length : 17;
    const na = pad ? pad.axes.length : 4;
    const cols = 10;
    const gap = 72;
    const els = [];
    for (let i = 0; i < nb; i++) {
      els.push({ t: 'btn', x: 50 + (i % cols) * gap, y: 50 + Math.floor(i / cols) * gap, w: 56, h: 56, label: String(i),
        bind: 'b' + i, fill: true });
    }
    let y = 50 + Math.ceil(nb / cols) * gap;
    const right = 50 + cols * gap;
    for (let j = 0; j < na; j++) {
      const col = j % 2;
      const yy = y + Math.floor(j / 2) * 52;
      const hat = pad && pad.axes[j] > 1.02;
      if (hat) els.push({ t: 'dpad', x: 140 + col * 340, y: yy + 30, w: 90, h: 90, bu: 'h' + j + 'u', bd: 'h' + j + 'd',
        bl: 'h' + j + 'l', br: 'h' + j + 'r' });
      else els.push({ t: 'trig', x: 170 + col * 340, y: yy, w: 300, h: 38, dir: 'right', bi: true, bind: 'a' + j,
        label: 'axis ' + j, fs: 18 });
    }
    y += Math.ceil(na / 2) * 52;
    if (na >= 2) els.push({ t: 'stick', x: right + 90, y: 110, w: 130, h: 130, bx: 'a0', by: 'a1', label: '0/1', fs: 16 });
    if (na >= 4) els.push({ t: 'stick', x: right + 90, y: 270, w: 130, h: 130, bx: 'a2', by: 'a3', label: '2/3', fs: 16 });
    return { name: 'All inputs', w: right + 190, h: Math.max(y + 10, na >= 4 ? 360 : 200), els: els };
  };

  // ------------------------------------------------------------------------------------- link encoding
  // Custom layouts travel in the overlay link: JSON, deflated where the browser can, then base64url.

  function clean(layout) {
    return JSON.parse(JSON.stringify(layout, function (k, v) {
      if (typeof v === 'number') return Math.round(v * 10) / 10;
      if (v === '' || v === null || v === false) return undefined;
      return v;
    }));
  }
  ID.clean = clean;

  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    const r = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await r.arrayBuffer());
  }

  ID.encodeLayout = async function (layout) {
    const raw = new TextEncoder().encode(JSON.stringify(clean(layout)));
    if (typeof CompressionStream === 'function') {
      try {
        return 'z' + b64u(await pipe(raw, new CompressionStream('deflate')));
      } catch (e) {}
    }
    return 'j' + b64u(raw);
  };

  ID.decodeLayout = async function (s) {
    let bytes = unb64u(s.slice(1));
    if (s[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate'));
    return ID.validate(JSON.parse(new TextDecoder().decode(bytes)));
  };

  ID.validate = function (l) {
    if (!l || typeof l !== 'object' || !Array.isArray(l.els)) throw new Error("That isn't an Input Display layout");
    l.w = +l.w > 0 ? +l.w : 1000;
    l.h = +l.h > 0 ? +l.h : 600;
    l.els = l.els.filter(function (e) { return e && typeof e === 'object' && typeof e.t === 'string'; });
    return l;
  };
})();
