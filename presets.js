/*
  Input Display: preset layouts
  -----------------------------
  Bindings use the browser's standard gamepad mapping (what XInput pads, DualShock / DualSense, Switch Pro and
  most modern controllers show up as): b0–b3 the face buttons by position (bottom, right, left, top), b4/b5
  bumpers, b6/b7 triggers, b8/b9 select/start, b10/b11 stick clicks, b12–b15 d-pad, b16 home, b17 touchpad /
  capture; axes 0/1 left stick, 2/3 right stick. The d-pads also read a POV hat on axis 9, which is how
  DirectInput controllers without the standard mapping send theirs, and the fight-stick and leverless
  directions also read the left stick, for sticks switched to LS mode. Anything else can be rebound in the editor.
*/
(function () {
  'use strict';
  const ID = window.InputDisplay;

  const UP = 'b12|h9u';
  const DOWN = 'b13|h9d';
  const LEFT = 'b14|h9l';
  const RIGHT = 'b15|h9r';
  const DIRS = { bu: 'b12|a1-|h9u', bd: 'b13|a1+|h9d', bl: 'b14|a0-|h9l', br: 'b15|a0+|h9r' };

  function btn(x, y, d, label, bind, o) {
    return Object.assign({ t: 'btn', x: x, y: y, w: d, h: d, shape: 'circle', label: label, bind: bind }, o);
  }
  function pill(x, y, w, h, label, bind, o) {
    return Object.assign({ t: 'btn', x: x, y: y, w: w, h: h, shape: 'pill', label: label, bind: bind }, o);
  }
  function stick(x, y, w, bx, by, bind, o) {
    return Object.assign({ t: 'stick', x: x, y: y, w: w, h: w, bx: bx, by: by, bind: bind }, o);
  }
  function trig(x, y, w, h, label, bind, o) {
    return Object.assign({ t: 'trig', x: x, y: y, w: w, h: h, label: label, bind: bind, dir: 'up' }, o);
  }
  function dpad(x, y, w, o) {
    return Object.assign({ t: 'dpad', x: x, y: y, w: w, h: w, bu: UP, bd: DOWN, bl: LEFT, br: RIGHT }, o);
  }
  function lever(x, y, w, o) {
    return Object.assign({ t: 'lever', x: x, y: y, w: w, h: w }, DIRS, o);
  }
  function text(x, y, label, fs) {
    return { t: 'label', x: x, y: y, label: label, fs: fs };
  }
  function body(x, y, d) {
    return { t: 'shape', x: x, y: y, d: d };
  }
  function panel(x, y, w, h) {
    return { t: 'shape', x: x, y: y, w: w, h: h, shape: 'rect' };
  }
  // a colored button: pressed color and label color the same
  function col(c) {
    return { c: c, tc: c };
  }
  // a button that's colored even when it's not pressed: a darker fill that lights up to c
  function tint(c, f) {
    return { c: c, f: f, tc: '#ffffff' };
  }

  // Mirrors the right half of an outline (from the top of the centre line, clockwise, back to the centre line at
  // the bottom; x measured from the centre) into a closed, symmetric path.
  function sym(start, segs) {
    const f = (p) => p[0] + ',' + p[1];
    const m = (p) => -p[0] + ',' + p[1];
    let d = 'M' + f(start);
    for (const s of segs) d += 'C' + f(s[0]) + ' ' + f(s[1]) + ' ' + f(s[2]);
    for (let i = segs.length - 1; i >= 0; i--) d += 'C' + m(segs[i][1]) + ' ' + m(segs[i][0]) + ' ' + m(i ? segs[i - 1][2] : start);
    return d + 'Z';
  }

  // Xbox Series, about 153 × 105 mm: broad shoulders, grips that splay out a little
  const XBOX = sym([0, 36], [
    [[108, 36], [210, 0], [300, 0]],
    [[384, 0], [432, 72], [444, 156]],
    [[456, 228], [468, 300], [462, 372]],
    [[456, 468], [432, 558], [396, 600]],
    [[366, 636], [312, 642], [276, 618]],
    [[240, 588], [210, 516], [180, 480]],
    [[132, 432], [60, 426], [0, 426]],
  ]);

  // DualSense, about 160 × 106 mm: flat top across the touchpad, long grips, a high arch between them
  const DUALSENSE = sym([0, 0], [
    [[120, 0], [240, -6], [312, 0]],
    [[396, 6], [450, 72], [462, 156]],
    [[474, 216], [486, 276], [480, 336]],
    [[474, 432], [450, 552], [408, 606]],
    [[378, 642], [312, 648], [288, 624]],
    [[258, 588], [216, 504], [180, 468]],
    [[132, 420], [60, 414], [0, 414]],
  ]);

  // Switch Pro, about 152 × 106 mm: rounded all over, short fat grips
  const SWITCH = sym([0, 42], [
    [[120, 42], [228, 6], [312, 6]],
    [[390, 6], [438, 66], [450, 144]],
    [[462, 216], [468, 288], [462, 360]],
    [[462, 468], [444, 564], [396, 606]],
    [[354, 642], [288, 642], [258, 612]],
    [[228, 576], [204, 504], [174, 480]],
    [[126, 450], [60, 444], [0, 444]],
  ]);

  // GameCube, about 150 × 105 mm: a rounded block with round bulbs hanging off it for grips
const GAMECUBE = sym([0, 60], [
    [[108, 60], [192, 18], [276, 18]],
    [[360, 18], [414, 72], [426, 144]],
    [[438, 240], [450, 348], [444, 444]],
    [[438, 576], [384, 636], [312, 636]],
    [[240, 636], [192, 576], [192, 504]],
    [[192, 456], [144, 420], [84, 420]],
    [[54, 420], [24, 420], [0, 420]],
  ]);

  const N64 = sym([0, 150], [
    [[120, 150], [240, 128], [320, 135]],
    [[400, 142], [450, 180], [455, 250]],
    [[460, 380], [440, 520], [425, 600]],
    [[415, 655], [340, 665], [325, 610]],
    [[310, 540], [300, 470], [250, 445]],
    [[210, 425], [160, 430], [140, 470]],
    [[120, 520], [115, 600], [100, 650]],
    [[85, 700], [30, 715], [0, 715]],
  ]);

  // SNES, about 145 × 62 mm: the dog bone, two round ends joined by a slightly pinched middle
  const SNES = sym([0, 94], [
    [[110, 94], [180, 70], [275, 70]],
    [[385, 70], [470, 150], [470, 265]],
    [[470, 380], [385, 460], [275, 460]],
    [[180, 460], [110, 438], [0, 438]],
  ]);

  // Genesis 6-button, about 2 : 1: a kidney, pinched at the top and bottom of the middle
  const GENESIS = sym([0, 130], [
    [[140, 130], [280, 38], [385, 70]],
    [[468, 98], [492, 238], [468, 350]],
    [[444, 460], [354, 525], [262, 495]],
    [[182, 470], [100, 408], [0, 408]],
  ]);

  // Saturn, about 2.1 : 1: a fuller oval with flat shoulders for L and R
  const SATURN = sym([0, 95], [
    [[150, 95], [300, 63], [392, 85]],
    [[474, 108], [498, 240], [474, 350]],
    [[450, 455], [362, 503], [270, 483]],
    [[188, 465], [100, 448], [0, 448]],
  ]);

  // an octagonal stick gate, like the GameCube's
  function octagon(r) {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const t = ((i + 0.5) * Math.PI) / 4;
      d += (i ? 'L' : 'M') + Math.round(Math.cos(t) * r) + ',' + Math.round(Math.sin(t) * r);
    }
    return d + 'Z';
  }
  // a recess in the body: a well round a d-pad or stick, a faceplate
  function well(x, y, w, h, shape, o) {
    return Object.assign({ t: 'shape', x: x, y: y, w: w, h: h || w, shape: shape || 'circle', inset: true }, o);
  }
  function gate(x, y, r) {
    return { t: 'shape', x: x, y: y, d: octagon(r), inset: true };
  }
  // four face buttons in a diamond round cx, cy, turned by deg (the SNES's tilt)
  function diamond(cx, cy, gap, d, deg, defs) {
    const a = (deg * Math.PI) / 180;
    return defs.map(function (b) {
      const dx = b[0] * gap;
      const dy = b[1] * gap;
      return btn(Math.round(cx + dx * Math.cos(a) - dy * Math.sin(a)), Math.round(cy + dx * Math.sin(a) + dy * Math.cos(a)), d,
        b[2], b[3], b[4]);
    });
  }

  const XB = { a: '#6cc24a', b: '#e5484d', x: '#3d8bfd', y: '#f5c518' };
  const PS = { tri: '#3fd3a5', cir: '#ff5a6a', crs: '#7aa6ff', sqr: '#ff7ad9' };
  const PUNCH = '#ff4fa3';
  const KICK = '#38c8ff';

  // the 8 buttons of a fight stick or leverless, Vewlix style: top row X Y RB LB, bottom row A B RT LT
  function eight(pos, d) {
    const top = [['X', 'b2'], ['Y', 'b3'], ['RB', 'b5'], ['LB', 'b4']];
    const bot = [['A', 'b0'], ['B', 'b1'], ['RT', 'b7'], ['LT', 'b6']];
    return pos.map(function (p, i) {
      const b = i < 4 ? top[i] : bot[i - 4];
      return btn(p[0], p[1], d, b[0], b[1], Object.assign(col(i < 4 ? PUNCH : KICK), { fs: 22 }));
    });
  }
  function smalls(x, y) {
    return [
      btn(x, y, 34, '', 'b8', { icon: 'view' }),
      btn(x + 58, y, 34, '', 'b9', { icon: 'menu' }),
      btn(x + 116, y, 34, '', 'b16', { icon: 'home' }),
    ];
  }

  ID.presets = [
    {
      id: 'xbox', name: 'Xbox', group: 'Gamepads',
      layout: { w: 1000, h: 800, els: [
        trig(212, 56, 140, 64, 'LT', 'b6'), trig(788, 56, 140, 64, 'RT', 'b7'),
        pill(200, 120, 200, 40, 'LB', 'b4', { fs: 18, r: -5 }), pill(800, 120, 200, 40, 'RB', 'b5', { fs: 18, r: 5 }),
        body(500, 140, XBOX),
        well(254, 338, 168), stick(254, 338, 146, 'a0', 'a1', 'b10', { cap: 0.66 }),
        well(368, 488, 150), dpad(368, 488, 130),
        well(632, 488, 160), stick(632, 488, 136, 'a2', 'a3', 'b11', { cap: 0.66 }),
        btn(752, 263, 68, 'Y', 'b3', col(XB.y)), btn(677, 338, 68, 'X', 'b2', col(XB.x)),
        btn(827, 338, 68, 'B', 'b1', col(XB.b)), btn(752, 413, 68, 'A', 'b0', col(XB.a)),
        btn(500, 248, 70, '', 'b16', { icon: 'home' }),
        btn(434, 362, 40, '', 'b8', { icon: 'view' }), btn(566, 362, 40, '', 'b9', { icon: 'menu' }),
        pill(500, 416, 46, 28, '', 'b17', { icon: 'capture', is: 0.5 }),
      ] },
    },
    {
      id: 'playstation', name: 'PlayStation', group: 'Gamepads',
      layout: { w: 1000, h: 810, els: [
        trig(200, 56, 140, 64, 'L2', 'b6'), trig(800, 56, 140, 64, 'R2', 'b7'),
        pill(190, 120, 180, 34, 'L1', 'b4', { fs: 17, r: -3 }), pill(810, 120, 180, 34, 'R1', 'b5', { fs: 17, r: 3 }),
        body(500, 140, DUALSENSE),
        btn(500, 232, 246, '', 'b17', { shape: 'round', h: 138 }),
        pill(326, 200, 20, 46, '', 'b8'), pill(674, 200, 20, 46, '', 'b9'),
        well(224, 320, 180), dpad(224, 320, 156, { style: 'buttons' }),
        well(380, 470, 150), stick(380, 470, 130, 'a0', 'a1', 'b10', { cap: 0.66 }),
        well(620, 470, 150), stick(620, 470, 130, 'a2', 'a3', 'b11', { cap: 0.66 }),
        btn(500, 462, 48, '', 'b16', { icon: 'home' }),
        well(500, 522, 50, 14, 'pill'),
        btn(776, 245, 64, '', 'b3', Object.assign(col(PS.tri), { icon: 'triangle' })),
        btn(701, 320, 64, '', 'b2', Object.assign(col(PS.sqr), { icon: 'square' })),
        btn(851, 320, 64, '', 'b1', Object.assign(col(PS.cir), { icon: 'circle' })),
        btn(776, 395, 64, '', 'b0', Object.assign(col(PS.crs), { icon: 'cross' })),
      ] },
    },
    {
      id: 'switch', name: 'Switch Pro', group: 'Gamepads',
      layout: { w: 1000, h: 800, els: [
        trig(212, 56, 140, 64, 'ZL', 'b6'), trig(788, 56, 140, 64, 'ZR', 'b7'),
        pill(205, 124, 200, 40, 'L', 'b4', { fs: 18, r: -4 }), pill(795, 124, 200, 40, 'R', 'b5', { fs: 18, r: 4 }),
        body(500, 140, SWITCH),
        well(242, 332, 168), stick(242, 332, 146, 'a0', 'a1', 'b10', { cap: 0.66 }),
        dpad(356, 490, 132, { style: 'buttons' }),
        well(644, 490, 160), stick(644, 490, 136, 'a2', 'a3', 'b11', { cap: 0.66 }),
        btn(758, 257, 66, 'X', 'b3'), btn(683, 332, 66, 'Y', 'b2'),
        btn(833, 332, 66, 'A', 'b1'), btn(758, 407, 66, 'B', 'b0'),
        btn(398, 236, 38, '', 'b8', { icon: 'minus' }), btn(602, 236, 38, '', 'b9', { icon: 'plus' }),
        btn(428, 320, 36, '', 'b17', { shape: 'rect', icon: 'capture' }),
        btn(572, 320, 40, '', 'b16', { icon: 'home' }),
      ] },
    },
    {
      id: 'gamecube', name: 'GameCube', group: 'Gamepads',
      layout: { w: 1000, h: 800, els: [
        trig(240, 66, 160, 66, 'L', 'b6'), trig(760, 66, 160, 66, 'R', 'b7'),
        pill(760, 140, 150, 28, 'Z', 'b5', { c: '#7b5cff', tc: '#a48bff', fs: 16, r: 4 }),
        body(500, 150, GAMECUBE),
        gate(236, 330, 84), stick(236, 330, 136, 'a0', 'a1', '', { cap: 0.58 }),
        well(344, 498, 112), dpad(344, 498, 88),
        gate(656, 498, 62),
        stick(656, 498, 102, 'a2', 'a3', '', { c: '#f5c518', f: '#c79a00', cap: 0.52, label: 'C', tc: '#3a3000', fs: 20 }),
        btn(500, 342, 36, '', 'b9'),
        btn(764, 342, 106, 'A', 'b0', { c: '#2fbf71', f: '#1f8a52', tc: '#d6ffe8', fs: 46 }),
        btn(680, 416, 58, 'B', 'b2', { c: '#ff5a6a', f: '#b8323e', tc: '#ffe0e3', fs: 24 }),
        pill(866, 312, 54, 110, 'X', 'b1', { r: -14, fs: 20 }),
        pill(746, 250, 110, 50, 'Y', 'b3', { r: -10, fs: 20 }),
      ] },
    },
    {
      id: 'n64', name: 'N64', group: 'Retro',
      layout: { w: 1000, h: 760, els: [
        pill(250, 104, 170, 30, 'L', 'b4', { fs: 17, r: -4 }), pill(750, 104, 170, 30, 'R', 'b5', { fs: 17, r: 4 }),
        body(500, 0, N64),
        well(215, 300, 150), dpad(215, 300, 124),
        btn(500, 296, 46, 'S', 'b9', { c: '#e5484d', f: '#a5262f', tc: '#ffe0e3', fs: 18 }),
        well(500, 526, 130), gate(500, 526, 58), stick(500, 526, 98, 'a0', 'a1', '', { cap: 0.62 }),
        pill(500, 655, 72, 40, 'Z', 'b6|b7', { fs: 18 }),
        btn(678, 326, 60, 'B', 'b2', { c: '#2fbf71', f: '#1f8a52', tc: '#d6ffe8' }),
        btn(746, 394, 60, 'A', 'b0', { c: '#4b7bff', f: '#2a4fc0', tc: '#e0e8ff' }),
        btn(830, 230, 44, '', 'a3-', { c: '#f5c518', f: '#c79a00', tc: '#3a3000', icon: 'up' }),
        btn(830, 322, 44, '', 'a3+', { c: '#f5c518', f: '#c79a00', tc: '#3a3000', icon: 'down' }),
        btn(784, 276, 44, '', 'a2-', { c: '#f5c518', f: '#c79a00', tc: '#3a3000', icon: 'left' }),
        btn(876, 276, 44, '', 'a2+', { c: '#f5c518', f: '#c79a00', tc: '#3a3000', icon: 'right' }),
      ] },
    },
    {
      id: 'snes', name: 'SNES', group: 'Retro',
      layout: { w: 1000, h: 500, els: [
        pill(240, 50, 250, 34, 'L', 'b4', { fs: 17, r: -2 }), pill(760, 50, 250, 34, 'R', 'b5', { fs: 17, r: 2 }),
        body(500, 0, SNES),
        well(230, 265, 210), dpad(230, 265, 156),
        well(772, 265, 290, 170, 'pill', { r: -24 }),
        pill(450, 282, 70, 24, '', 'b8', { r: -28 }), pill(550, 282, 70, 24, '', 'b9', { r: -28 }),
        text(448, 330, 'SELECT', 15), text(552, 330, 'START', 15),
        ...diamond(772, 265, 70, 64, -24, [
          [0, -1, 'X', 'b3', tint('#8f9bff', '#4a55b0')], [-1, 0, 'Y', 'b2', tint('#4fd377', '#24804a')],
          [1, 0, 'A', 'b1', tint('#ff6b78', '#b8323e')], [0, 1, 'B', 'b0', tint('#ffd23f', '#b08a10')],
        ]),
      ] },
    },
    {
      id: 'nes', name: 'NES', group: 'Retro',
      layout: { w: 1000, h: 470, els: [
        panel(500, 235, 920, 400),
        well(500, 250, 840, 320, 'rect'),
        well(500, 150, 210, 16, 'pill'), well(500, 182, 210, 16, 'pill'), well(500, 214, 210, 16, 'pill'),
        dpad(210, 262, 164),
        text(462, 254, 'SELECT', 15), text(560, 254, 'START', 15),
        well(511, 298, 200, 62, 'round'),
        pill(462, 298, 70, 24, '', 'b8'), pill(560, 298, 70, 24, '', 'b9'),
        well(728, 296, 112, 112, 'round'), well(856, 296, 112, 112, 'round'),
        btn(728, 296, 86, '', 'b0', tint('#ff6b6b', '#c62f38')), btn(856, 296, 86, '', 'b1', tint('#ff6b6b', '#c62f38')),
        text(762, 378, 'B', 24), text(890, 378, 'A', 24),
      ] },
    },
    {
      id: 'genesis', name: 'Genesis 6-button', group: 'Retro',
      layout: { w: 1000, h: 560, els: [
        pill(790, 44, 84, 24, 'MODE', 'b8', { fs: 12, r: 12 }),
        body(500, 0, GENESIS),
        well(248, 283, 230), dpad(248, 283, 172, { arm: 0.4 }),
        pill(500, 210, 76, 26, '', 'b9'), text(500, 252, 'START', 15),
        btn(626, 255, 56, 'X', 'b3', { fs: 20 }), btn(722, 222, 56, 'Y', 'b4', { fs: 20 }), btn(818, 192, 56, 'Z', 'b5', { fs: 20 }),
        btn(642, 366, 76, 'A', 'b2'), btn(746, 333, 76, 'B', 'b0'), btn(850, 300, 76, 'C', 'b1'),
      ] },
    },
    {
      id: 'saturn', name: 'Saturn', group: 'Retro',
      layout: { w: 1000, h: 560, els: [
        pill(222, 46, 210, 32, 'L', 'b6', { fs: 17, r: -3 }), pill(778, 46, 210, 32, 'R', 'b7', { fs: 17, r: 3 }),
        body(500, 0, SATURN),
        well(250, 283, 214), dpad(250, 283, 172, { style: 'buttons' }),
        pill(500, 312, 70, 28, '', 'b9'), text(500, 354, 'START', 15),
        btn(634, 236, 52, 'X', 'b3', { fs: 20 }), btn(728, 212, 52, 'Y', 'b4', { fs: 20 }), btn(822, 212, 52, 'Z', 'b5', { fs: 20 }),
        btn(638, 350, 74, 'A', 'b2', col('#ff5a6a')), btn(736, 326, 74, 'B', 'b0', col('#f5c518')),
        btn(834, 326, 74, 'C', 'b1', col('#3fbf63')),
      ] },
    },
    {
      id: 'hitbox', name: 'Hit Box', group: 'Leverless',
      layout: { w: 1000, h: 560, els: [
        panel(500, 280, 960, 520),
        ...smalls(90, 70),
        btn(150, 250, 74, '', DIRS.bl, { icon: 'left' }),
        btn(240, 222, 74, '', DIRS.bd, { icon: 'down' }),
        btn(325, 250, 74, '', DIRS.br, { icon: 'right' }),
        btn(430, 440, 90, '', DIRS.bu, { icon: 'up' }),
        ...eight([[560, 225], [650, 197], [742, 197], [832, 218], [548, 318], [638, 290], [730, 290], [820, 311]], 74),
      ] },
    },
    {
      id: 'leverless-wasd', name: 'Leverless (WASD)', group: 'Leverless',
      layout: { w: 1000, h: 560, els: [
        panel(500, 280, 960, 520),
        ...smalls(90, 70),
        btn(218, 175, 74, '', DIRS.bu, { icon: 'up' }),
        btn(150, 265, 74, '', DIRS.bl, { icon: 'left' }),
        btn(240, 265, 74, '', DIRS.bd, { icon: 'down' }),
        btn(330, 265, 74, '', DIRS.br, { icon: 'right' }),
        btn(430, 440, 90, '', DIRS.bu, { icon: 'up' }),
        ...eight([[560, 225], [650, 197], [742, 197], [832, 218], [548, 318], [638, 290], [730, 290], [820, 311]], 74),
      ] },
    },
    {
      id: 'stick-8', name: 'Fight stick (8-button)', group: 'Arcade',
      layout: { w: 1000, h: 520, els: [
        panel(500, 260, 960, 480),
        ...smalls(790, 66),
        lever(240, 275, 210, { gate: 'square', c: '#e5484d' }),
        ...eight([[545, 215], [637, 185], [731, 185], [825, 203], [535, 312], [627, 282], [721, 282], [815, 300]], 76),
      ] },
    },
    {
      id: 'stick-6', name: 'Arcade (6-button)', group: 'Arcade',
      layout: { w: 1000, h: 520, els: [
        panel(500, 260, 960, 480),
        btn(850, 66, 34, '', 'b8', { icon: 'view' }), btn(908, 66, 34, '', 'b9', { icon: 'menu' }),
        lever(245, 275, 210, { gate: 'square', c: '#e5484d' }),
        btn(560, 215, 78, 'X', 'b2', Object.assign(col(PUNCH), { fs: 22 })),
        btn(655, 195, 78, 'Y', 'b3', Object.assign(col(PUNCH), { fs: 22 })),
        btn(750, 195, 78, 'RB', 'b5', Object.assign(col(PUNCH), { fs: 22 })),
        btn(560, 312, 78, 'A', 'b0', Object.assign(col(KICK), { fs: 22 })),
        btn(655, 292, 78, 'B', 'b1', Object.assign(col(KICK), { fs: 22 })),
        btn(750, 292, 78, 'RT', 'b7', Object.assign(col(KICK), { fs: 22 })),
      ] },
    },
    {
      id: 'stick-4', name: 'Arcade (4-button)', group: 'Arcade',
      layout: { w: 1000, h: 520, els: [
        panel(500, 260, 960, 480),
        btn(850, 70, 34, '', 'b8', { icon: 'view' }), btn(908, 70, 34, '', 'b9', { icon: 'menu' }),
        lever(240, 280, 210, { c: '#e5484d' }),
        btn(560, 330, 84, 'A', 'b0', col('#e5484d')), btn(665, 275, 84, 'B', 'b1', col('#f2c230')),
        btn(775, 250, 84, 'C', 'b2', col('#2fbf71')), btn(885, 262, 84, 'D', 'b3', col('#3d8bfd')),
      ] },
    },
    { id: 'raw', name: 'All inputs', group: 'Tools', dynamic: true, layout: ID.rawLayout(null) },
  ];

  ID.preset = function (id) {
    return ID.presets.find(function (p) { return p.id === id; }) || null;
  };

  // a fresh copy of a preset's layout, ready to change
  ID.presetLayout = function (id, pad) {
    const p = ID.preset(id);
    if (!p) return null;
    const l = p.dynamic ? ID.rawLayout(pad) : JSON.parse(JSON.stringify(p.layout));
    l.name = p.name;
    return l;
  };
})();
