# Input Display

A controller input display for OBS, as a browser source. It shows a controller and lights up whatever's
pressed. It works with any controller the browser can see: XInput and DirectInput pads, PlayStation and Switch
controllers, fight sticks, leverless boxes, adapters and so on. Everything is drawn as vectors, so it stays sharp
at any size.

- `index.html` is the editor. Pick a preset or build your own layout, bind each part by pressing it on the
  controller, choose a look, and copy the link.
- `overlay.html` is the overlay itself. It reads everything from the link.

## Presets

| Group     | Presets                                                                  |
| --------- | ------------------------------------------------------------------------ |
| Gamepads  | Xbox, PlayStation, Switch Pro, GameCube                                  |
| Retro     | N64, SNES, NES, Genesis 6-button, Saturn                                 |
| Leverless | Hit Box, Leverless (WASD)                                                |
| Arcade    | Fight stick (8-button, Vewlix), Arcade (6-button), Arcade (4-button)     |
| Tools     | All inputs: every button and axis the controller has, laid out as it is |

The presets use the browser's standard gamepad mapping. The d-pads also read a POV hat, and the fight-stick
and leverless directions also read the left stick, so a stick in DP, LS or DirectInput mode still lights
them. If a controller has no standard mapping (the editor tells you when it doesn't), open the preset in the
editor and rebind what doesn't line up.

## The editor

- **Toolbar**: add buttons, sticks, analog triggers, d-pads, arcade sticks (ball-top lever with a round,
  square or octagonal gate), labels and shapes. Shapes can be rounded panels or any SVG path, for controller
  bodies. Duplicate, mirror to the other side, delete, undo and redo, and snap to a grid.
- **Canvas**: drag to move (hold Alt to skip the snap), drag the corner handle to resize, arrow keys to nudge
  (Shift for 10).
- **Bind**: click **Bind** next to an input and press it on the controller (or a key). **+** adds another input
  that also counts. You can also type bindings in directly:

  | Binding      | Means                                                      |
  | ------------ | ---------------------------------------------------------- |
  | `b6`         | button 6, with its analog value                            |
  | `a1+` `a1-`  | one direction of axis 1                                    |
  | `a5~`        | all of axis 5, -1…1 read as 0…1 (a trigger that's an axis) |
  | `a0` `!a1`   | a whole axis, for sticks (`!` flips it)                    |
  | `h9u`        | a POV hat on axis 9: `u`, `d`, `l` or `r`                  |
  | `k:KeyZ`     | a key (only while the page has focus, so not inside OBS)   |
  | `b12\|h9u`   | either of them                                             |

- The bar along the bottom shows every button and axis of the connected controller live, plus the last
  input as a binding.
- **My layouts**: save layouts in this browser, export them as `.json` and import them again.

## Setup

1. Open `index.html` (or wherever it's hosted), pick or make a layout, then **Copy link**.
2. In OBS: **Add → Browser**, paste the link, and make the source the size the editor shows (e.g.
   1000×800) or any size with that shape. The background is transparent inside OBS.
3. Press a button on the controller. Browsers only see a controller once one of its buttons has been
   pressed.

The link holds the whole layout, so OBS doesn't need anything saved. You can also change its settings by
hand. The full list is in the comment at the top of `overlay.html`: `theme`, `colors`, `glow`, `body`, `pad`,
`idle` (fade out when nothing's pressed), color overrides, `align`, `src` to load a layout `.json` from a URL,
and `demo=1`, where a pretend controller plays by itself.

There's no build step and no dependencies.
