# Out of Wind

**Play it: [out-of-wind.junkdrawer.works](https://out-of-wind.junkdrawer.works/)**

**Flatten rough boards with hand planes.** Each board comes off the sawmill bowed, cupped or twisted, sometimes with grain that turns around partway along, and has to finish flat at three-quarters of an inch for a tabletop. Swipe along it to take a stroke: the plane rides on the high spots and cuts only there. Scribble pencil across the face and plane until it's gone, check it with a straightedge and winding sticks, and stop before you go through the gauge line.

## How it plays

- **Swipe along the board to take a stroke.** The blade cuts under your finger, pushing away or pulling toward you; dragging back lifts the iron. A stroke counts once the plane has gone somewhere on the board.
- **Three planes.** The 22-inch jointer rides over hollows and takes the high spots down until the face is true. The 14-inch jack has a curved edge set deep: it scoops high spots off fast and leaves a scalloped face. The 9-inch smoother is set fine; it follows the face rather than flattening it, and gets through wild grain clean.
- **The plane rests on what's under its sole.** Along the stroke the sole sits on the highest points beneath it, so the long jointer bridges a hollow and the short smoother dips into one. Across the board it's held square to the face, and it can't cut deeper than the wood either side of its blade, so you work across the board lane by lane. Pressure goes on the toe as the plane comes onto the board and on the heel as it leaves, so it doesn't dive off the ends.
- **Pencil.** Scribble across the face, then plane: the pencil goes first from the high spots. When a light pass takes it off everywhere, the face is flat.
- **Straightedge.** Drag along or across the board to lay it down. The side view shows light under it wherever the face dips away.
- **Winding sticks.** Two sticks across the ends, and a view sighting down them: an even sliver of the far stick over the near one when the face is out of wind, a wedge when it's twisted.
- **The side view** under the board (beside it on a phone) shows the face along the line you're working, magnified, with the plane's sole riding on it and the dashed gauge line three-quarters of an inch up from the underside.
- **The top bar** counts strokes against par, says how far the face is from flat (and how much is still rough-sawn), and gives the thinnest spot against the line.
- **Read the grain.** The lines along the board's front edge are the fibres running out to the face, and they slope down into the board the way to plane. Go the other way and the grain tears out with a crackle, leaving torn fibres you'll have to plane out. Curly maple turns every inch and interlocked mahogany turns in stripes, so on those only the smoother gets through clean.
- **Twist and crowns.** Long straight strokes take an even shaving off a twisted face or a crown without changing its shape, so those need short strokes on the high spots, or a stroke from one high corner diagonally to the other. The early boards say what just happened as you go, and if eight strokes haven't brought a face any nearer flat, the bench says what shape is left (hollow, crowned, cupped or in wind) and what takes it out, once a board.
- **Thirteen boards:** pine, poplar, ash, red oak, cherry, walnut, mahogany, quartersawn white oak, hard maple and curly maple, each warped its own way, then a panel glued up from walnut, maple and cherry with the middle board turned end for end and standing proud. Each opens when you finish the one before.
- **A board is done when it's flat and planed all over.** Then it gets a mark each for keeping its thickness, no tear-out and strokes within par, and a lumber grade: FAS for all of them, then Select, No. 1 Common and No. 2 Common. Go through the gauge line anywhere and the board's a cull.
- **Par, and the thickness each board starts at, come from a solver** that planes every board the way a careful woodworker would: it works out the plane that leaves the board thickest, never planes past it, goes with the grain, and gets below any tear-out at the end. Every board starts thick enough for the solver to finish it a little above the line. Par is the solver's strokes and half as many again, because the solver measures exactly where the board stands high and a person finds out with the pencil and the checks. The thickness mark asks for at least halfway between the gauge line and what the solver kept, and the card before each board says how thick that is.
- No account and no server. Your grades and any board you're part-way through stay in your browser. It works offline and installs to a phone's home screen. Inches in the US, millimetres elsewhere; switch in the menu. On a keyboard, 1, 2 and 3 pick the planes, and P, E and W the pencil, straightedge and winding sticks.

## Running it

It's a static site: plain HTML, CSS and JavaScript modules, with no build step.

```sh
npx serve .                   # or any static file server, then open the printed address
npm test                      # the planes, boards and solver in Node, then plays it in Chromium (needs Playwright)
npm run par                   # works out each board's rough thickness and par; add -- --write to save them
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
```

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`. The `CNAME` file gives it its own address, out-of-wind.junkdrawer.works.

### Files

- `js/board.js`: a board as a grid of heights over a warped underside, with its warp, grain, knots and figure made from a seed; the measurements (flatness, the thinnest spot, straightedge, winding sticks); and saving one part-way.
- `js/plane.js`: the three planes and what a stroke does: where the sole rests, where the blade cuts, and tear-out.
- `js/boards.js`: the thirteen boards, with each one's rough thickness and par.
- `js/woods.js`: each wood's colour, grain and how readily it tears out.
- `js/solver.js`: the bot that planes each board to set par; `scripts/par.mjs` runs it.
- `js/wood.js`: draws each board's planed and rough-sawn faces, pixel by pixel.
- `js/draw.js`: draws the bench: the board's layers, the lamp, pencil, tear-out, the plane, shavings, the checks and the side view.
- `js/app.js`: the page: the rack of boards, the bench, strokes from your finger, grading and saving.
- `js/sound.js`: shavings, tear-out, pencil, the steel rule, the winding sticks and the bell, all made with Web Audio.
- `js/units.js`, `js/store.js`, `js/rng.js`: inches or millimetres, what's kept in localStorage, and seeded randomness.
- `fonts/`: Young Serif, Alegreya Sans and Reenie Beanie (SIL Open Font License), served from here so nothing loads from elsewhere.
- `sw.js`: keeps a copy for playing offline.
