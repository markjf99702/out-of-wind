# Out of Wind

**Play it: [out-of-wind.junkdrawer.works](https://out-of-wind.junkdrawer.works/)**

**Flatten rough boards with hand planes.** Each board comes off the sawmill bowed, cupped or twisted, sometimes with grain that turns around partway along, and has to finish flat at three-quarters of an inch for a tabletop. Swipe along it to take a stroke: the plane rides on the high spots and cuts only there. Scribble pencil across the face and plane until it's gone, check it with a straightedge and winding sticks, and stop before you go through the gauge line.

<p align="center">
  <img src="docs/phone-planing.png" alt="A cherry board on the bench with the jointer partway along it and a shaving in its mouth, pencil scribble left on the rough patches, shavings curled on the bench beside it, and the side view showing light under the plane's sole" width="250">
  &nbsp;
  <img src="docs/phone-sticks.png" alt="Board 3, poplar, with winding sticks across both ends and the view sighting down them: the far stick tilts against the near one, and the note says the far right and near left corners are high" width="250">
  &nbsp;
  <img src="docs/phone-rack.png" alt="The rack of boards, with 4 of 13 done, 2 graded FAS pencilled under the title: the first four planed with their grades pencilled on, FAS, Select, FAS and #1 Com, the fifth open in rough ash, and the rest locked" width="250">
</p>

## How it plays

- **Swipe along the board, end to end, to take a stroke,** pushing away or pulling toward you; dragging back lifts the iron. A stroke put down within a fingertip of one end starts from that end, and one lifted that close to the other runs off it. A stroke counts when it takes a shaving. One that cuts nothing is free, and the bench says why: the plane rode on higher wood, went across the board, or was off it.
- **Three planes.** The 22-inch jointer rides over hollows and takes the high spots down until the face is true. The 14-inch jack has a curved edge set deep: it scoops high spots off fast and leaves a scalloped face. The 9-inch smoother is set fine; it follows the face rather than flattening it, and gets through wild grain clean.
- **The plane rests on what's under its sole,** so the long jointer bridges a hollow and the short smoother dips into one. It can't cut deeper than the wood either side of its blade, so you work across the board lane by lane.
- **Pencil.** Scribble across the face, then plane: the pencil goes first from the high spots, and where it's left, the plane didn't reach.
- **Straightedge.** Drag along or across the board to lay it down. Light shows under it wherever the face dips away, and a note says what it sees: a hollow, a cup, or rocking on a high spot and where.
- **Winding sticks.** Two sticks across the ends, and the view sighting down the board between them. Out of wind, their top edges line up; twisted, the far one tilts.
- **The side view** shows the face along the line you're working, magnified, with the plane resting on its high spots, light under the sole where it bridges a hollow, and the dashed gauge line three-quarters of an inch up from the underside. Go through that anywhere and the board's a cull.
- **Read the grain on the edge.** Follow a line from the face into the wood and it heads the way to plane. Go the other way and the grain tears out with a crackle, leaving a pit you'll have to plane out. Curly maple turns every inch and interlocked mahogany turns in stripes, so only the smoother gets through those clean.
- **Twist and crowns.** Long straight strokes take an even shaving off a twisted or crowned face without changing its shape, so those need short strokes on the high spots, or a stroke from one high corner diagonally to the other. If eight strokes haven't brought a face nearer flat, the bench says what shape is left and where it stands highest. Nearly flat, it says where after every stroke.
- **Graded like lumber.** A board is done when it's flat and planed all over. It gets a mark each for keeping its thickness (the card before each board says how thick), no tear-out, and strokes within par: FAS for all of them, then Select, No. 1 Common and No. 2 Common, pencilled on the rack as a lumberyard marks them. The top bar shows all four as you go.
- **Thirteen boards:** pine, poplar, ash, red oak, cherry, walnut, mahogany, quartersawn white oak, hard maple and curly maple, each warped its own way, then a panel glued up from walnut, maple and cherry. Each opens when you finish the one before, and one you've finished opens fresh to plane again; the rack offers a way back to the board you're part-way through. Finish the panel and you get the tabletop, with every board's grade in a tally under it.
- **Par comes from a solver** that planes each board the way a careful woodworker would. A person has to find the high spots that the solver can see, so par is its strokes and half as many again, or what following the board's card takes, if that's more.
- No account and no server. Your grades and any board you're part-way through stay in your browser. It works offline and installs to a phone's home screen. Inches in the US, millimetres elsewhere; switch in the menu. On a keyboard, 1, 2 and 3 pick the planes, and P, E and W the pencil, straightedge and winding sticks.

## Running it

It's a static site: plain HTML, CSS and JavaScript modules, with no build step.

```sh
npm start                     # serves it at http://localhost:8080 (any static file server will do)
npm install                   # only for the tools below: esbuild and upng-js
npm test                      # the planes, boards, solver and cards in Node, then plays it in Chromium (needs Playwright)
npm run par                   # works out each board's rough thickness and par; add -- --write to save them
node scripts/cards.mjs        # plays each board the way its card says, and prints the strokes it took
node tools/screenshots.mjs    # redraws docs/phone-*.png and og.png
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
npm run build                 # dist/out-of-wind.html and dist/artifact.html: the whole game in one file
```

The one-file copy plays the same, without the offline copy or installing.

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`. The `CNAME` file gives it its own address, out-of-wind.junkdrawer.works.

### Files

- `js/board.js`: a board as a grid of heights over a warped underside, with its warp, grain, knots and figure made from a seed; what the checks measure (flatness, the thinnest spot, the shape that's left, the straightedge, the winding sticks); and saving one part-way.
- `js/plane.js`: the three planes and what a stroke does: where the sole rests, where the blade cuts, tear-out, and how near an end counts as off it.
- `js/boards.js`: the thirteen boards, with each one's rough thickness, par and thickness mark. `js/woods.js`: each wood's colour, grain and how readily it tears out.
- `js/solver.js`: the bot that planes each board to set par and the thickness it starts at; `scripts/par.mjs` runs it.
- `scripts/cards.mjs`: a second player who follows each board's card and sees only what the page shows: the sticks, the light under the straightedge, rough patches, the grain on the edge, tear-out and the bench's notes. `npm test` has it finish every board within par, with its strokes started off the ends, and again with each one put down 8 mm onto the board and lifted 8 mm short, as a finger does.
- `js/app.js`: the page: the rack of boards, the bench, strokes from your finger, the bench's notes, grading and saving.
- `js/wood.js` draws each board's planed and rough-sawn faces, pixel by pixel; `js/draw.js` the bench: the lamp, pencil, tear-out, the plane, shavings, the checks and the side view; `js/table.js` the finished tabletop.
- `js/sound.js`: shavings, tear-out, pencil, the steel rule, the winding sticks and the bell, all made with Web Audio.
- `js/units.js`, `js/store.js`, `js/rng.js`: inches or millimetres, what's kept in localStorage, and seeded randomness.
- `fonts/`: Young Serif, Alegreya Sans and Reenie Beanie (SIL Open Font License), served from here so nothing loads from elsewhere.
- `sw.js`: keeps a copy for playing offline. `npm test` checks that it lists every file the page needs.
- `test/unit.test.mjs`: the planes, the measurements, the boards, the solver and the cards, in Node. `test/e2e.mjs` plays the real page in Chromium on a phone, a laptop and a phone on its side, through to the tabletop, and checks it installs and plays offline.
- `og.png`, `docs/` and `tools/screenshots.mjs`: the link preview, the screenshots above, and the script that takes them. `icon.svg`, `tools/icon-full-bleed.svg` and `tools/make-icons.mjs`: the icon, and the script that draws the PNG icons from it.
- `scripts/build.mjs`: bundles the game into one file for the playable copy, with the fonts and icon inside it. What it writes in `dist/` isn't kept in the repo.
