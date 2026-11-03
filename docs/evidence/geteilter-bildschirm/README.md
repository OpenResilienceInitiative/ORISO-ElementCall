# The shared screen, and the room it needs

Two plates from the visual-proof harness, shot in real Chromium at a 2x
device pixel ratio with
`ORISO_ARTWORK_DIR=<an ORISO checkout>/public/static/anon-animals
npx vite --config harness/vite.harness.config.ts` and
`CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/shootOrisoStage.mjs`.

| Plate                | What it shows                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `01-before-teilen`   | Two people in the Hain while somebody shares a screen. The shared screen's box is pinned to the corner and stands on the otter. |
| `01-after-teilen`    | The same call with the band reserved. The forms are smaller, which is the trade, and neither is underneath the box.             |

**What these plates are not.** They are the layout's own arithmetic —
`stageBesideSpotlight`, then `OrisoGroveLayout`'s two-person branch line for
line — drawn against the real `OrisoFace` and the real artwork. They are not
a photograph of a running call: there is no LiveKit, no Matrix and no `Grid`
here, so nothing in them exercises the dragging or the springs.

The proof that no form lands under the box is not a picture at all. It is
`src/grid/OrisoGroveLayout.spotlight.test.tsx`, which renders the real layout
with a mocked `Grid` and reads back every rectangle it asks for, at two
counts of people, in both arrangements, with the box pinned to either edge.
Against the unfixed layout it reports the overlap in pixels — at 900x620
with two people, the form began at y=128 while the band runs to y=233.

The live-test screenshots this answers are in the Slack canvas
"Call v2 — Live Test Walkthrough" of 22 October 2026, which also has the
second half of this branch: the name tag reading `@cyrus:oriso.org`.
