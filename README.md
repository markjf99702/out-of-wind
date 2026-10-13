# Out of Wind

**Play it: [out-of-wind.junkdrawer.works](https://out-of-wind.junkdrawer.works/)**

**Flatten rough boards with hand planes.** Each board comes off the sawmill bowed, cupped or twisted, sometimes with grain that turns around partway along, and has to finish flat at three-quarters of an inch for a tabletop. Swipe along it to take a stroke: the plane rides on the high spots and cuts only there. Scribble pencil across the face and plane until it's gone, check it with a straightedge and winding sticks, and stop before you go through the gauge line.

<p align="center">
  <img src="docs/phone-planing.png" alt="A cherry board on the bench with the jointer partway along it and a shaving in its mouth, pencil scribble left on the rough patches, shavings curled on the bench beside it, and the side view showing light under the plane's sole" width="250">
  &nbsp;
  <img src="docs/phone-sticks.png" alt="Board 3, poplar, with winding sticks across both ends and the view sighting down them: the far stick tilts against the near one, and the note says the far right and near left corners are high" width="250">
  &nbsp;
  <img src="docs/phone-rack.png" alt="The rack of boards: the first four planed with their grades pencilled on, FAS, Select, FAS and No. 1, the fifth open in rough ash, and the rest locked" width="250">
</p>

## How it plays

- **Swipe along the board to take a stroke.** The blade cuts under your finger, pushing away or pulling toward you; dragging back lifts the iron. A stroke counts when it takes a shaving; one that cuts nothing is free, and the bench says why. The first time on the bench, a faint plane glides along the board to show one.
- **Three planes.** The 22-inch jointer rides over hollows and takes the high spots down until the face is true. The 14-inch jack has a curved edge set deep: it scoops high spots off fast and leaves a scalloped face. The 9-inch smoother is set fine; it follows the face rather than flattening it, and gets through wild grain clean.
- **The plane rests on what's under its sole.** Along the stroke the sole sits on the highest points beneath it, so the long jointer bridges a hollow and the short smoother dips into one. Across the board it's held square to the face, and it can't cut deeper than the wood either side of its blade, so you work across the board lane by lane. Pressure goes on the toe as the plane comes onto the board and on the heel as it leaves, so it doesn't dive off the ends.
- **Pencil.** Scribble across the face, then plane: the pencil goes first from the high spots, and where it's left, the plane didn't reach. A clean face only says the plane cut everywhere, which it will on a crowned or twisted face too.
- **Straightedge.** Drag along or across the board to lay it down. The side view shows light under it wherever the face dips away, and a note says what it sees: light in the middle (a hollow along the board, a cup across it), rocking on a high spot and where, the face falling away toward one end, or two high spots.
- **Winding sticks.** Two sticks across the ends, and the view sighting down the board between them, the far stick pale with dark inlays and the near one dark with pale ones: out of wind, their top edges are parallel; twisted, the far one tilts (exaggerated a great deal).
- **The side view** under the board (beside it on a phone) shows the face along the line you're working, magnified, with the plane resting on its high spots, light under the sole wherever it bridges a hollow, and the dashed gauge line three-quarters of an inch up from the underside.
- **The lamp** rakes across the face from the far end: a cup shows one long edge darker than the other, a crown a darker near half.
- **The top bar** shows the four marks a board is graded on as you go: strokes against par, how far the face is from flat and what flat is (or how much is still rough-sawn), the thinnest spot against the thickness to keep, and spots of tear-out. Each turns amber once its mark is gone.
- **Read the grain.** The lines along the board's front edge are the fibres running out to the face, and they slope down into the board the way to plane. Go the other way and the grain tears out with a crackle, leaving torn fibres you'll have to plane out. Curly maple turns every inch and interlocked mahogany turns in stripes, so on those only the smoother gets through clean.
- **Twist and crowns.** Long straight strokes take an even shaving off a twisted face or a crown without changing its shape, so those need short strokes on the high spots, or a stroke from one high corner diagonally to the other. The early boards say what just happened as you go, and if eight strokes haven't brought a face any nearer flat, the bench says what shape is left (hollow, crowned, cupped, in wind, or high patches) and what takes it out, on every attempt.
- **Thirteen boards:** pine, poplar, ash, red oak, cherry, walnut, mahogany, quartersawn white oak, hard maple and curly maple, each warped its own way, then a panel glued up from walnut, maple and cherry with the middle board turned end for end and standing proud. Each opens when you finish the one before; tap a locked one and it says which to finish first. A board you've finished opens fresh, with your best grade on its card, to plane again.
- **A board is done when it's flat and planed all over.** Then it gets a mark each for keeping its thickness, no tear-out and strokes within par, and a lumber grade: FAS for all of them, then Select, No. 1 Common and No. 2 Common. Go through the gauge line anywhere and the board's a cull.
- **Par, and the thickness each board starts at, come from a solver** that planes every board the way a careful woodworker would: it works out the plane that leaves the board thickest, never planes past it, goes with the grain, and gets below any tear-out at the end. Every board starts thick enough for the solver to finish it a little above the line. Par is the solver's strokes and half as many again, because the solver measures exactly where the board stands high and a person finds out with the pencil and the checks. The thickness mark asks for at least halfway between the gauge line and what the solver kept, and the card before each board says how thick that is.
- **Every card works.** A second player (`scripts/cards.mjs`) planes each board the way its card says, judging the face only by what the page shows: the winding sticks, the light under the straightedge, rough patches, the grain on the edge and tear-out. It has to finish every board up to the panel within par, with its lanes spaced three different ways, and par is never less than it takes.
- No account and no server. Your grades and any board you're part-way through stay in your browser. It works offline and installs to a phone's home screen. Inches in the US, millimetres elsewhere; switch in the menu. On a keyboard, 1, 2 and 3 pick the planes, and P, E and W the pencil, straightedge and winding sticks.

## Running it

It's a static site: plain HTML, CSS and JavaScript modules, with no build step.

```sh
npm start                     # serves it at http://localhost:8080 (any static file server will do)
npm test                      # the planes, boards, solver and cards in Node, then plays it in Chromium (needs Playwright)
npm run par                   # works out each board's rough thickness and par; add -- --write to save them
node scripts/cards.mjs        # plays each board the way its card says, and prints the strokes it took
node tools/screenshots.mjs    # redraws docs/phone-*.png and og.png (npm install first, for upng-js)
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
```

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`. The `CNAME` file gives it its own address, out-of-wind.junkdrawer.works.

### Files

- `js/board.js`: a board as a grid of heights over a warped underside, with its warp, grain, knots and figure made from a seed; the measurements (flatness, the thinnest spot, the shape that's left, the straightedge and what it shows, the winding sticks); and saving one part-way.
- `js/plane.js`: the three planes and what a stroke does: where the sole rests, where the blade cuts, and tear-out.
- `js/boards.js`: the thirteen boards, with each one's rough thickness, par and thickness mark.
- `js/woods.js`: each wood's colour, grain and how readily it tears out.
- `js/solver.js`: the bot that planes each board to set par; `scripts/par.mjs` runs it.
- `scripts/cards.mjs`: a person following each board's card, who sees only what the page shows; the tests and `scripts/par.mjs` use it.
- `js/wood.js`: draws each board's planed and rough-sawn faces, pixel by pixel.
- `js/draw.js`: draws the bench: the board's layers, the lamp, pencil, tear-out, the plane, shavings, the checks and the side view.
- `js/app.js`: the page: the rack of boards, the bench, strokes from your finger, grading and saving.
- `js/sound.js`: shavings, tear-out, pencil, the steel rule, the winding sticks and the bell, all made with Web Audio.
- `js/units.js`, `js/store.js`, `js/rng.js`: inches or millimetres, what's kept in localStorage, and seeded randomness.
- `fonts/`: Young Serif, Alegreya Sans and Reenie Beanie (SIL Open Font License), served from here so nothing loads from elsewhere.
- `sw.js`: keeps a copy for playing offline.
- `test/unit.test.mjs`: the planes, the measurements, the boards and the solver, in Node; `test/e2e.mjs` plays the real page in Chromium on a phone, a laptop and a phone on its side.
- `icon.svg`, `tools/icon-full-bleed.svg` and `tools/make-icons.mjs`: the icon, and the script that draws the PNG icons from it.
- `og.png`, `docs/` and `tools/screenshots.mjs`: the link preview, the screenshots above, and the script that takes them.
