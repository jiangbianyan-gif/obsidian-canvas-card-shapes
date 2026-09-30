# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 — 2026-09-30

First release.

**Added**

- **24 shapes for Canvas cards**, in two groups:
  - *Basic*: square, rounded, pill, ellipse, diamond, parallelogram, hexagon,
    octagon, triangle, star, cloud, folded note.
  - *Flowchart* (the standard symbols for programming-logic diagrams):
    terminator, process, decision, input/output, predefined process, document,
    database, manual input, delay, annotation, preparation, connector.
- **Right-click menu** on a single card, and on a multi-selection (one shape for
  all selected cards). The shape currently in effect is ticked.
- **Command palette entries** — one per shape, plus "clear the selection" and
  "clear the whole board" — all acting on the current selection.
- A **padding** setting (text-to-edge distance), applied through a CSS variable so
  each shape can add its own extra inset where the usable area is small.
- A **self-check** command that reports the version, whether the submenu is
  supported, how many nodes on this board carry a shape, and whether the class
  names are actually on the DOM.

**Notes**

- Rounded shapes keep the card's native border; shapes cut with `clip-path`
  (diamond, hexagon, …) deliberately drop it, because a clipped border would show
  as fragments floating outside the shape. They use `drop-shadow` instead so the
  outline stays readable, and an accent-coloured glow as the selection cue.
  One trap worth writing down: per the CSS spec the filter is applied **before**
  clipping ("first any filter effect is applied, then any clipping, masking and
  opacity"), so `filter` and `clip-path` on the same element clips the shadow away
  entirely. The shadow therefore lives on the card frame and the clipping on a
  layer inside it.
- **Text is vertically centred.** Obsidian lays card text out flush to the top,
  which on a diamond / triangle / star puts it exactly where the shape has no
  room. The cause is that Obsidian's text block is `flex: 1 0 0` — it eats all the
  leftover height and leaves a single 16 px spacer above it. The plugin makes the
  text block `flex: 0 0 auto` and lifts the 16 px cap on the two spacer
  pseudo-elements, so they split the slack and the text lands in the middle.
  Text too tall to fit makes the spacers shrink to zero, so it starts at the top
  and the beginning is never cropped (verified with a headless-Chrome DOM probe:
  spacers 56/56 px, offset 0).
- **Group cards are excluded on purpose** (`.canvas-node-group`): a group is the
  container holding other cards, so clipping it would hide them.
- All shape styling targets `.canvas-node-container`, never `.canvas-node` —
  the latter is a `0 × 0` positioning anchor in Obsidian, so anything drawn on it
  is invisible.
- Shapes are stored in the plugin's data file, keyed by canvas path and node id —
  the `.canvas` file is never touched, so it stays standard JSON Canvas. As a
  consequence, uninstalling the plugin removes the shapes.
- Card DOM is rebuilt by Obsidian on tab switches and layout changes, so the class
  names are re-applied on `layout-change` and `active-leaf-change`. That re-apply
  step is what makes shapes survive a zoom, a re-sort or a reopen.
