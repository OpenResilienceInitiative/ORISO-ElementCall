# Every call view, at three stage sizes

Thirteen plates each at `desktop` (1280x720), `tablet` (834x1000, portrait)
and `mobile` (390x680). Reproduced with

```
ORISO_ARTWORK_DIR=<an ORISO checkout>/public/static/anon-animals \
  npx vite --config harness/vite.harness.config.ts
STAGE=mobile SHOT_DIR=<out> CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node scripts/shootOrisoStage.mjs
```

The sizes live in `STAGES` in `harness/orisoStage.tsx`, so one is added in
one place. Passing no `STAGE` gives the 960x640 the older plates in this
directory's siblings were shot at, which keeps them comparable.

**A stage is not a viewport.** What the arrangements see is the stage inside
the host's floating call window, not the browser. These three are the ones
that decide something: the desktop case is a counsellor with the window
opened out; the tablet case is portrait, where the grove's square leaves
bands above and below rather than stretching every organic form into an
ellipse; the phone is the width at which the shared screen's box stops being
404px wide and `.inRoom` begins clipping horizontally.

The plates are shot at a 2x device pixel ratio and stored at half that with
a 200-colour palette — about 80 KB each rather than 1.2 MB, with no visible
banding in the backdrop. The originals are reproducible from the command
above.

## What these are not

The real `OrisoFace`, the real `packShapes` / `splitCells` / `shareFor` /
`seamFor`, the real `Atmosphere`, the real `ViewSwitcher` and the real
artwork — arranged by the layouts' own functions. But there is no LiveKit
here, no Matrix and no `Grid`, so nothing in them exercises the springs, the
dragging or a real video track. They are the design, drawn accurately; they
are not a photograph of a call.

Two things to read them with:

- **`teilen-vorher` is a deliberate regression.** It draws the arrangement as
  it was before the band was reserved, so the two plates can be compared. The
  proof that no form lands under the shared screen is
  `src/grid/OrisoGroveLayout.spotlight.test.tsx`, which renders the real
  layout and reads back every rectangle it asks for.
- **The grove is a square at every size.** In portrait that leaves bands
  above and below. That is `groveBox` centring it rather than stretching it,
  and it is the design's answer, not a gap — but it is the thing to look at
  first on the tablet plates and to decide about deliberately.
