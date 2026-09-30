# Canvas Card Shapes

Give Canvas cards a **shape** — from basic geometry to the symbols used in
**flowcharts and programming-logic diagrams**. Stock Canvas has exactly one shape:
a rectangle.

- Right-click a card → **卡片形状** → pick a shape (the one in effect is ticked).
- **Select several cards, then right-click** → one shape for all of them.
- Command palette → *卡片形状: diamond* and friends, applied to the selection.

## What you get

| Group | Shapes |
|---|---|
| **Basic** (12) | square · rounded · pill · ellipse · diamond · parallelogram · hexagon · octagon · triangle · star · cloud · folded note |
| **Flowchart** (12) | terminator · process · decision · input/output · predefined process · document · database · manual input · delay · annotation · preparation · connector |

The flowchart group is the standard set for programming-logic diagrams: decision as
a diamond, input/output as a parallelogram, storage as a cylinder, start/end as a
capsule — so you do not have to fake shapes with styled rectangles.

## Three deliberate trade-offs

1. **Rounded shapes keep their border; clipped shapes do not.**
   Rounded / pill / ellipse / cloud / document / database / delay are done with
   `border-radius`, so the card's own border follows the curve and stays visible.
   Diamond / hexagon / parallelogram / triangle / star / folded note are cut with
   `clip-path`, and **CSS clipping can cut a shape but cannot stroke it** — a
   border would need two stacked elements, which breaks Obsidian's selection box
   and dragging. Not worth it.
   Clipped shapes get a shape-following `filter: drop-shadow()` outline instead,
   and turn into an accent-coloured glow when selected (the native rectangular
   selection ring is clipped away, so it would otherwise be invisible).
   One trap here: per the CSS spec `filter` is applied **before** `clip-path`, so
   putting both on the same element clips the shadow away entirely. The shadow
   therefore sits on the card frame, and the clipping on a layer inside it.

2. **Text is vertically centred.**
   Obsidian lays card text out flush to the top; on a diamond, triangle or star
   — shapes that are narrow at the top — that puts the text exactly where there
   is no room, and it gets cut in half. The cause is that Obsidian's own text
   block eats all the leftover height (leaving exactly one 16 px spacer above
   it). The plugin flips that around: the text block stops taking the slack and
   the two spacers split it, so the text lands in the middle of the shape. When
   the text is too tall to fit, the spacers shrink to zero and it simply starts
   at the top, so the beginning is never cropped.

3. **Shapes are stored in the plugin's own data file, never in the `.canvas`.**
   The canvas file stays standard JSON Canvas — no private fields for other tools
   or other machines to trip over. The cost: uninstalling the plugin loses the
   shapes. This is the same trade-off the companion *Canvas Node Align* makes.

## Settings

- **Padding** — the space between text and the card edge. Shapes with small usable
  areas (diamond, triangle) add extra on top of it; enlarging the card helps more
  than reducing the padding.

## Known limitations

- Shapes do **not resize the card**, and they do not move connection points. Edges
  still anchor to the card's rectangular bounding box, so a line into a diamond
  meets it near a corner — that is how Canvas draws edges.
- Text is laid out as a rectangle and then clipped, not flowed along the shape. In
  extreme cases (very flat card, long text) a little can be cut off — make the card
  bigger.
- Image cards and embedded notes can take a shape, but a clipped shape
  on an image may not look like what you hoped. **Groups do not take a shape** —
  a group is the container that holds other cards, so clipping it would hide them;
  the plugin excludes it on purpose.

## Related plugins

- **Canvas Node Align** — text alignment (horizontal and vertical) for cards and
  labels; designed to work alongside this one.
- *Advanced Canvas* also ships flowchart node styles. This plugin adds the
  decorative set (star, cloud, folded note, octagon…), Chinese menus, and padding
  that coexists with text alignment. Use whichever fits; they do not conflict.

## Install

Community plugins → search for **Canvas Card Shapes** (after the directory
review), or copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/canvas-card-shapes/` and enable it in
*Settings → Community plugins*.

## Development

```
main.js              shape table + menus + commands + the re-apply mechanism
styles.css           one rule per shape (radius / clip-path / padding)
test/shapes.test.js  332 assertions: shape-table contract, data keys, apply/read
                     class names, a two-way stylesheet guard, wiring guards
test/build.test.mjs  tests the release tooling itself
```

```bash
npm test          # both test files
npm run build     # the same command the community directory runs
npm run verify    # metadata + build + tests
```

## Privacy

No network access, no telemetry, no reading of note contents. It does exactly two
things: puts a class name on a card element, and records one line in the plugin's
data file.

## License

MIT
