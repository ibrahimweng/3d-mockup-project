# Mockup Studio

Photoreal product mockups that render **entirely in your browser** — free,
private, and with no backend. Built on the [Toolcraft](https://toolcraft.sh) app
framework, rendered with [three.js](https://threejs.org) under image-based
lighting.

Drop in a screenshot and it appears on the chosen device's display, lit by a
captured photography studio. Choose a piece of merchandise instead and the same
image is printed on it. Rotate the device by dragging it, pick a focal
length and a backdrop, and export the frame as an image. You can also keyframe
the device and export a short video, which is covered under
[Animation](#animation) below. The screenshot is never uploaded to a server.
There is no API key, no account, and nothing to pay for.

## Develop

```bash
npm install
npm run dev
```

## Deploy

`npm run build` produces `dist/`, and everything the studio itself does happens
in the browser. `vercel.json` pins the Vite framework preset, the build command,
the `dist` output directory, and a rewrite that sends every path except `/api/`
to `index.html` so the client router can answer for `/admin`.

There are two serverless functions in `api/`, and the studio works without them:
they exist only for the email list below. Nothing else needs a server, and no
environment variable is required to render, animate or export anything.

## The first visit

A first-time visitor is walked through four steps on the studio's own controls,
not a carousel of pictures: pick a product, drop a design on it, drag it to turn
it, and then the ask. Each step spotlights the real control and waits for the
real action — the value it watches has to change — so what someone has at the
end is a product shot they made and the knowledge of how they made it. A **Next**
button appears after ten seconds so nobody is trapped on a step they cannot work
out, and **Skip tour** is on every one of them.

The spotlight is four rectangles around a hole rather than one overlay with a
transparent middle, because the hole has to be a real hole: the step is "use this
control", so the control has to be usable, and anything covering it — even
something fully transparent — is between the pointer and the thing.

The last step asks for an email, with a skip offered immediately rather than
after a countdown. The export gate below makes people wait eight seconds before
it offers a way out, and that is right there because something is being withheld.
Here nothing is: they have just been given a tour, and a timed lock would be the
studio charging for a favour it already did.

It runs once. The flag is site data, so clearing the browser's storage brings it
back — deliberately, because nothing else here identifies a visitor and a
first-run experience should not need to.

## Collecting emails

The tour's last step is the first ask. The export gate is the second, and the
backstop for everyone who skipped: pressing **Export PNG**, **Export Video** or
Ctrl/Cmd-E opens a modal asking for an email, and holds the export behind it. Skipping is offered after **eight
seconds**, which is the point of the delay: the time turns a reflex into a
choice, so someone who genuinely does not want to leave an address reads why
first and then gets their file.

It asks on every export until an address is given. A signup the server accepts
closes it for good; skipping does not, because a skip is not an answer.

It never actually withholds a file. Skip releases the export, and so does a
failure: if the endpoint is unconfigured or down, the error is shown and the
export runs anyway. Nobody is ever unable to use this because a database is.

### Reaching the export button at all

The runtime owns both export buttons — they are typed export roles it runs
itself, and `onPanelAction` is only handed the actions the product owns, so
there is no press to refuse. The gate catches the click in the **capture phase
on `document`**, which is an ancestor of the root React attaches its listeners
to: stopping it there means React never dispatches and the runtime never learns
the button was pressed. Releasing presses the same button back, the way the
quick-action palette does, so there is one export path rather than two.

Every part of it fails open. A press is swallowed only when the gate is certain
it recognised an export button and certain it is armed; anything unexpected
lets the click through. An ungated export is a much smaller failure than a
person who cannot export.

### Why there is a server at all

The rest of this is a static site, and a static site cannot keep a secret:
everything it ships is readable in devtools, so a database credential in the
bundle is a credential anyone can use. The two Edge functions in `api/` are the
only things that hold it. The browser posts an address to `/api/subscribe` and
never touches the store.

All the logic lives in `src/signup/` rather than in `api/`, because `api/` is
outside the repository's `sourceRoots` — nothing there is linted, line-budgeted
or reached by `npm test`. The two files under `api/` are one line each.

### Setting it up

Free, and about five minutes. The store is Upstash Redis over its REST API,
which needs no driver — one `fetch` with a bearer token, which is also why it
runs on the Edge runtime.

1. Create a free Redis database at [upstash.com](https://upstash.com).
2. Copy its **REST URL** and **REST token**.
3. In Vercel → Project → Settings → Environment Variables, add:

| Variable | What it is |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | The REST URL from Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | The REST token from Upstash |
| `ADMIN_PASSWORD` | A password you choose. **Must be at least 16 characters** — the endpoint refuses to serve at all below that, because a weak password on a public endpoint reads as protection while providing very little |

4. Redeploy.

Until those are set, `/api/subscribe` answers `503` and the card says so out
loud. That is deliberate: a form that accepts every address and stores none
looks exactly like one that works, and would lose every signup in silence.

### Reading the list

Addresses are pulled, not pushed — nothing arrives in an inbox. Go to
**`/admin`** on the deployed site: it asks for `ADMIN_PASSWORD`, posts it to
`/api/emails`, and shows the addresses with a **Download CSV** button. The password is compared inside the
function against the environment — never in the browser, where a check is
something anyone can skip by not running it — and the comparison is over
SHA-256 digests so neither the content nor the length of the secret leaks
through how long it takes. Nothing is remembered between visits: no token, no
cookie, no local copy of the password.

The CSV arrives as a real form submission answered with a `Content-Disposition`
header, so the server hands over the file and no script in the page touches the
bytes. That is not a style preference — product source is forbidden from owning
artifact delivery, and a blob plus an invisible link is exactly that pattern.

### What is deliberately not built

- **It is not a login.** Nothing verifies the address; anyone can type anything.
  Verifying it means emailing a one-time link, which needs a mail sender.
- **"Once" is a courtesy, not a lock.** Both the tour and the "already gave an
  address" flag are `localStorage`, so a private window or cleared site data
  asks again. Since neither gates anything, the worst a bypass wins is a second
  sight of it.
- **No ads.** They would need a slot in a full-viewport 3D canvas, they are
  heavy next to WebGL, and running them makes the site commercial, which
  Vercel's free Hobby plan does not cover.

### The privacy note

`/privacy` says what is collected and what is not, and it is linked from both
places the address is asked for — the tour's last step and the export modal,
where the promise is made — and from the help screen, for anyone who never
presses Export.

Its strongest claim is that designs never leave the browser, and that one is
held to the source rather than to good intentions:
`src/routes/privacy-claims.test.ts` walks `src/app` and `src/routes` for network
primitives and fails on any call the note has not accounted for. There are
three today — a `blob:` read for an uploaded GIF, the signup POST, and the admin
list — and a fourth breaks the build, naming the file, which is the moment to
ask whether the note is still true.

Deleting one address is `HDEL mockup-studio:emails <address>` from the Upstash
console. The contact address and the operator name are two constants at the top
of `src/routes/privacy.tsx`.

## Devices

| Device | Model file | Notes |
| --- | --- | --- |
| iPhone 17 Pro Max | `iphone-5.glb` | Default. Named for an iPhone 5, but holds a 17 Pro Max in orange. Its back panel's colour is printed into a texture, so a colourway repaints it rather than tinting it |
| MacBook | `macbook.glb` | Scene `Scene.002`; the file also holds an iPhone and the iMac below |
| iMac | `macbook.glb` | Scene `Scene.001`; the 24-inch model, sharing the MacBook's download |
| Mac Studio | `mac-studio.glb` | The display, its stand and the machine beside it. Shipped exactly as supplied, Draco and all; repaired at load rather than in the file |
| Apple Watch Ultra | `apple-watch-ultra.glb` | Nearly square screen, so tall screenshots crop hard |

## Merchandise

These carry a printed design rather than a display. The same upload, the same
studio and the same export work on all of them.

| Product | Model file | Upload slots | Colour slots |
| --- | --- | --- | --- |
| T-Shirt | `tshirt.glb` | Front, Back, Left sleeve, Right sleeve | Body cloth, collar rib, placket trim |
| Tote Bag | `tote-bag.glb` | Front, Back, Left side, Right side | Canvas, handles and lining; base |
| Water Bottle | `water-bottle.glb` | One, wrapped 360° around the body | Cap, ring, latch |
| ID Card | `id-card.glb` | Front, Back (full bleed, around the punch hole) | Clip, card edge |
| Clipboard | `tablet-folder.glb` | One, on the top sheet | Hardboard, plastic pen, steel clip |

### Where the design lands, and why it flows

Every merchandise model here was re-unwrapped. The UVs these files shipped with
were authored for the texture the model came with — packed as islands, with the
space between them that packing needs, and with each island scaled to whatever
that particular texture wanted. An uploaded design laid over them lands in
pieces: a logo that crosses an island boundary is cut in half and the halves
arrive somewhere else on the product. The bottle was the clearest case, using
57 per cent of its U range with the base disc parked beside the wall as a
separate island, so a wrap-around design covered a bit over half the bottle and
then started again.

What ships now is one continuous unwrap per print zone, each filling 0..1 with
no island and no gap, computed from the geometry rather than from any texture:

- **The bottle body** is unwrapped cylindrically — angle around the axis to U,
  distance along the profile to V — so one image wraps the whole bottle and
  meets itself at the seam behind. Distance along the profile rather than
  height, because the shoulder loses 5mm of radius over 8mm of height and is
  therefore longer than it is tall. Triangles crossing the seam are repaired
  individually, which is why there is no visible join. It is the only product
  whose upload skips the fit-to-frame step, because refitting a cylinder to a
  rectangle is what put the design on half of it. The label covers everything
  that faces away from the axis, up to where the chrome ring takes over; only
  the disc it stands on and the annulus under the ring are bare, because a wrap
  has nowhere to put a surface facing along its own axis. The head is a
  separate part in plastic.
- **The card** carries two zones. Front and back are the same size and each
  fills its own 0..1, so front and back take separate uploads. The clip is
  metal and takes no design.
- **The tote** carries four: front, back, left and right. Each prints its whole
  side, fold to fold and base to mouth, the way a sublimated bag is printed. A
  plane cannot hold a fold and each side runs round two, so the unwrap follows
  the cloth instead: the bag is sliced into horizontal rings and a point sits
  where it falls along its own ring.
- **The shirt** carries four: front, back and a sleeve each. Each fills its
  whole panel to the seams the garment is sewn on, with the design following
  the cloth round the body rather than projected onto a plane. Ink stops at the
  hem, the last 8mm of each cuff and the collar rib.

The shirt's zones are cut on the pieces the modeller already separated — the
front panel, the back panel and each sleeve are distinct primitives in the file
— rather than on which way a triangle faces. That distinction turned out to
matter more than it sounds. A normal-direction threshold cuts a ragged boundary
wherever the surface curves through it, and a shoulder is exactly where the
surface turns over: a quarter of the front panel fell outside any threshold and
came out as a torn grey band down the shoulder and sleeve seams. Splitting on
the garment pieces gives every face a zone, and leaves 708 triangles of hem
facing as the only untextured cotton, which is what a hem facing is.

### A print zone covers the whole panel

The card's print used to stop about a sixth of the way down from the top, with
the rest of the badge rendering as brushed steel. The clip was picked out of
the source using the file's own atlas — everything above v 0.66 — and that
swept up the badge's own reinforced top along with the metal. The geometry says
where the two part far more plainly: sampled in bands, the full card width of
2.13 holds from the bottom up to y 1.70 and then drops to 0.450 and stays
there. That 4.7x step is the clasp starting, so the split is made there. A
design now prints to the top edge and around the punch hole, which is what a
real badge does. The print area grew, so the card's templates are 1270 x 2048
at 0.62 : 1 rather than 1426 x 2048 at 0.70 : 1.

`a print zone covers the whole face it is the print zone of` in
[`model-surfaces.test.ts`](src/app/model-surfaces.test.ts) holds every product
to it. It reads the shipped GLB's geometry, groups triangles by the plane they
lie in, and requires each zone's material to own at least 97 per cent of the
plane it sits on. Nothing in the catalog or the schema could have caught this:
both name a material, and neither says how much of a face that material
actually owns.

### Surfaces, and why nothing is see-through

Every material on a merchandise model renders both of its faces. That is not a
style choice — splitting a product into print zones is what makes each zone an
open patch of surface, and an open patch culled from behind is a hole. A shirt
is a single-layer shell, so its inside is visible up a sleeve, through a neck
and across an armhole; a bag's is visible down its mouth. Rebuilding the zones
created fresh glTF materials, a fresh glTF material is single-sided, and the
result was a shirt that went transparent from the side with a black wedge where
its armhole should be.

`every material a product names renders both of its faces` in
[`model-surfaces.test.ts`](src/app/model-surfaces.test.ts) reads the shipped
GLBs and holds them to it, walking the materials each catalog entry names
rather than a list written by hand.

The tote carries a canvas weave, and unlike the shirt's it is supplied rather
than restored: its file ships no normal map, so there was nothing to put back.
The density is measured rather than chosen to look right. The bag's front panel
is 5.685 units across and a tote of this shape is about 38cm wide, which puts a
unit at 6.7cm; the tile carries eight thread crossings, so 10.4 tiles per unit
lands about 1.2 threads to the millimetre, the coarse end of canvas. It is laid
out from world position rather than from the unwrap, which is what keeps the
narrow sides reading as the same cloth as the front.

The shirt's fabric also carries its weave again. The map is authored against
the file's own texture coordinates, which are in millimetres and tile, so it
cannot ride the 0..1 unwrap a design uses — one texel would stretch across a
whole panel. The original coordinates travel with the vertices as a second UV
channel and the normal map is pointed at that channel, which is what lets a
close-up read as cotton rather than as vinyl. The tote's file never had one, so
its canvas is smooth; the card's is the badge's own embossed lettering rather
than card stock, and is deliberately left off for the reason `clearPrintRelief`
exists.

The tote's folds, corners and slack are the model's own. An earlier source was
a flat panel with no volume, and three passes of prep existed to put back what a
bag already has: inflating it into something with depth, hemming a mouth that
was one vertex thick, and rounding folds that met with no transition. All three
are gone, along with the machinery for them, because the source now used is a
closed bag with solid webbing straps. It is a fifth of a 301,100-triangle mesh,
kept at a fifth because that is what holds the creases the repairs were
imitating.

Being closed, the tote has thickness and an inside: `Bag_Lining` is what you
look down into through the mouth, and a fold seen exactly edge-on has width.
The shirt is still a single-layer shell, so its hem and cuffs seen edge-on are
lines with none; rendering both faces is what stops that reading as a hole.

### Templates

`public/templates/` holds a placeholder image for every print zone, and each
one is what the model actually renders until a design is uploaded. They are
sized to the zone's measured aspect, carry a grid, a centre cross, a margin box
and their own dimensions printed on them, so a design built to one of these
arrives at the size and orientation it was drawn at.

| Zone | Template | Pixels | What it is |
| --- | --- | --- | --- |
| Bottle body | `water-bottle-body.png` | 2048 × 1490 (1.37 : 1) | 137mm around, 100mm foot to neck |
| Card front / back | `id-card-front.png`, `id-card-back.png` | 1291 × 2048 | full bleed |
| Tote front | `tote-bag-front.png` | 1745 × 2048 | 319 × 375mm, flattened panel |
| Tote back | `tote-bag-back.png` | 1725 × 2048 | 320 × 379mm, flattened panel |
| Tote gussets | `tote-bag-left.png`, `tote-bag-right.png` | 860 × 2048 | 158 × 375mm, flattened panel |
| Shirt front | `tshirt-front.png` | 1742 × 2048 | 528 × 622mm, flattened panel |
| Shirt back | `tshirt-back.png` | 1683 × 2048 | 521 × 634mm, flattened panel |
| Shirt sleeves | `tshirt-sleeve-left.png`, `tshirt-sleeve-right.png` | 2048 × 1586 | 427 × 331mm, flattened panel, cuff at the top |

The bottle's is the one to look at first: it is marked at the quarter turns, so
you can see which part of a 360° wrap faces the camera before drawing anything
on it.

**Download** under Templates hands them back. A product with one zone gives you
that PNG; a product with several gives you a zip, one file per zone. What comes
down is the file the model was built from rather than anything regenerated — a
design drawn over a template lands where it was drawn only while the two are
the same image, so there is one copy of each and the download links straight at
it. Devices have no Templates section: a screen has proportions but no printed
sheet.

The archives are committed beside the images and rebuilt with
`node scripts/build-template-archives.mjs <archive.zip> <name.png>...`. A test
opens each one and compares every entry against the file on disk, because an
archive that has fallen behind is worse than none — it looks right and lands a
design somewhere it was not drawn for.

Uploading a design replaces the template on the zone the upload is bound to.
Clearing the upload puts the template back, which is why the template is
captured alongside the model's other print maps rather than being a starting
value that gets overwritten.

### Uploading to a zone

The Artwork section carries an uploader per zone, and shows one at a time. A
**Panel** picker above the box says which zone it is for, because the runtime
cannot label an upload box: a `fileDrop` is handed to `FileDrop` with no label
prop and wrapped in a bare `contents` div, so four of them side by side were
four identical squares reading "Click to upload an image". The picker is offered
wherever a product has more than one panel, with exactly the panels that product
has: four on a shirt or a tote, two on a card. A control's options are static,
so that is two picker controls writing one value rather than one picker that
changes shape. A card shows two, a tote and a shirt show four, a bottle and
every device show one, because which slots exist is read off the catalog rather
than listed in the panel — declaring a zone is the single act that offers its
upload.

Four slots rather than a slot per named part, for the same reason there are
three colour slots rather than one per part: schema controls are static, so a
product cannot declare "left sleeve" and have a control appear for it. Left and
right mean the same thing on every product — the side you see on the left of an
unrotated model — so the shirt's left sleeve and the tote's left panel are the
same slot.

Each slot is independent. Uploading to one leaves the others as they were,
clearing one puts that zone's template back and leaves the rest printed, and the
rotate and flip actions under each uploader turn that zone's image alone. The
export reads the same four slots the canvas does, so the file matches the frame
you were looking at.

### A design that moves

Every zone takes a GIF, an MP4 or a WebM as readily as a PNG, and plays it on
the timeline's clock. Scrubbing the playhead scrubs the design, pausing holds it
on a frame, and an exported video carries the same animation every time it is
rendered rather than wherever the decoder happened to have reached.

A GIF is taken apart with the browser's own image decoder, one frame at a time.
The timings are read once on upload, by decoding every frame and keeping only
when it belongs; that costs about four milliseconds a frame, so a hundred and
twenty of them is half a second of waiting, once, at upload. Afterwards a frame
costs about four milliseconds whether it is the next one or one from the far end
of the clip, which is what makes scrubbing as cheap as playing. Exactly one
decoded frame is held at a time: a twenty megabyte GIF is nearer three hundred
decoded, so keeping them all is not an option and, at these speeds, not a need.

A video is left to play and nudged only when it drifts, because seeking one per
frame would make it unwatchable. Paused or scrubbed it is seeked, because then
the exact frame is the whole point.

Neither ever makes the preview wait. A source hands back the newest frame it has
and goes after the one asked for in the background, so a slow decode costs the
frame it was late for nothing and shows up on the next one. Export is the single
exception: it asks, waits, and asks again, because a file written one frame at a
time cannot take a frame that arrives late.

The design follows the timeline whenever there is a timeline to follow, and
keeps its own time when there is not. That second half matters more than it
sounds: the runtime stops its clock when nothing is keyframed — there is
nothing to play, so it does not play — and a GIF dropped onto a still scene
would otherwise sit on its first frame for ever, with a Play button that does
nothing about it. So with no keyframes the design simply loops. Add a keyframe,
the Turntable preset or anything else, and it falls in behind the playhead:
scrub and it scrubs, pause and it holds.

Export never reads either clock. It walks the loop itself and asks for the
frame at each moment, so a scene with no keyframes still exports its animation,
and exports the same one every time.

One thing to know: the GIF path needs the browser's image decoder, which
Chromium and Safari have. Where it is missing a GIF falls back to its first
frame, which is what an `<img>` would have shown anyway.

### A design keeps its proportions

Fit is the default, because a printer neither crops your artwork nor stretches
it, and a design cut to the zone's own shape lands on it untouched.

For that to be true the zone's shape has to be known, and for a long time it was
not. The fit maths measured each panel from its mesh's *local* box while
reasoning about how the panel sits in the world -- which way is up, which axis
runs away from the viewer. Any model whose node turns or scales its panel
therefore handed it the wrong shape. The shirt and the tote were unaffected,
their nodes being identity, which is why nothing looked wrong there; the ID
card's node stands it upright, and its local box gave 0.63 where the truth is
1.59 -- the reciprocal. Fit and Fill then corrected the wrong axis and every
upload arrived on the card two and a half times too wide. Measured on an export,
a design cut to the card's ratio came back 48.9 tiles across where 20 were
authored; it is now 20.7.

The controls they share are Fit & scale and Print background: Fit, Fill,
Stretch, scale, position, stretch and the colour under the design apply to
every zone at once. A design fitted to the front
is fitted to the back with it. That is a real limit rather than an oversight —
per-zone placement would be four more sections of the same six controls — and it
matters most where two zones are different shapes, which is the tote, whose
sides are about half the width of its front.

### Transparency, and what shows through it

A real print file is a mark on nothing: the areas that are not ink are
transparent, because the garment is what shows through them. Bound straight to
an opaque surface that is not what happens. three.js samples the colour
channels and ignores alpha, and a transparent pixel is stored as black with
zero alpha, so a logo on a transparent ground used to turn the whole shirt
front black — measured at RGB (12, 11, 11) against (213, 210, 208) for the
sleeve beside it.

**Print background**, under the uploaders, is the colour the design is laid
over. It defaults to white, which is the blank stock all of these products are,
so a transparent PNG now prints as a mark on white fabric without anyone
touching the control. Picking a colour prints it on that colour instead.

It is composited into the bitmap when the image is decoded rather than made
into a transparent material. Transparency on a garment would have to be sorted
against itself every frame — a shirt's front and back panels overlap — and the
export would have to reproduce the same sort to match the canvas. Flattening it
once at decode keeps every surface opaque and makes the two identical by
construction.

It reaches the zones that carry a design and no others. A shirt with a
transparent front and nothing on its sleeves prints the background on the front
and leaves the sleeves on their templates, because there is no design there to
put anything under. The colour under a design is a different thing from the
colour of the garment, and only the first is built.

### What is not built yet

Fit, scale, position and stretch are shared across a product's zones, as noted
above. Per-zone placement is not built.

Neither is real cloth thickness on the shirt. It is a single-layer shell, so an
edge seen exactly on is a line rather than a hem. The tote is closed and has
thickness of its own.

### How the design is bound

The design is bound to base colour rather than emission. A screen emits light,
so a screenshot on one stays legible whatever the studio is doing. Print does
not emit. Bound the same way, a shirt would glow in an unlit corner.

A print zone is deliberately not also a colour slot. Repainting a part writes
its base colour and clears its map, so a card face that was both would lose its
template the moment a colourway was picked. The parts a colour picker can reach
are the ones that carry no print: the bottle's cap, ring and latch, the card's
clip and edge, the tote's canvas, handles, lining and base, the shirt's collar
rib and its
hem facings. The shirt has two rather than three because its four print
zones cover every panel, and a slot with nothing left to paint is worse than
no slot.

The models are not interchangeable, so each one is a catalog entry in
[`src/app/merchandise-catalog.ts`](src/app/merchandise-catalog.ts) rather than a
branch in the renderer: which file to load, which scene inside it actually holds
the product, which material carries the print, which stray nodes to hide before
measuring bounds, the aspect where a tilted panel cannot be measured, and a yaw
for a model that faces away from the default camera. Every value was read out of
the GLB rather than guessed.

Each device also declares the materials that make up its shell, so one
colourway is a single colour rather than a list: `Natural` leaves the model
exactly as its author built it, and the rest repaint the shell while keeping the
metalness and roughness that make an enclosure read as brushed or polished. A
device with parts that are deliberately a different colour — a watch band
against its case — declares those as accents.

Adding another product is a catalog entry, not a code change. A merchandise
entry names the material the design prints on, and up to three parts a colour
picker can reach. Where a file paints a whole product with one material and
separates the parts by mesh instead, the entry asks for the material to be
split per mesh at load, which gives each part a name without touching the file.

## How a render works

1. The device model and the selected `.hdr` environment load once. The
   environment is convolved through three.js's `PMREMGenerator` into mip levels
   representing increasing roughness — this is the entire lighting model, and
   there are no separate lights to place.
2. The uploaded design is decoded into a texture and bound to every display
   material on the device, on the *emissive* channel, so it reads at full
   brightness regardless of how the environment happens to be lighting the rest
   of the device. Rotate and flip are baked into that bitmap, along with any
   correction the model's own screen UVs need. Fit mode, scale, position and
   stretch then rewrite the texture's repeat and offset; none of them rebuild
   the scene.
3. A three-point rig is placed on top of the captured environment. The key is
   the only shadow caster, because a second caster reads as two suns.
4. Every frame is a single raster pass. There is no accumulator and nothing to
   converge, so orbiting the camera costs one draw call and an idle scene does
   no work at all.
5. Export builds a second renderer at the artifact's own resolution and draws
   one frame. Preview and export read the same settings through the same scene
   builder, so the exported frame is the frame the preview showed. A video
   export runs that same path once per frame, at thirty frames a second, and
   hands the frames to an encoder.

## Controls

The panel is four tabs, because showing every control at once put 43 fields and
15 section headers into a 272px column — 3,783px of scroll in a 608px window on
a shirt, whichever of the four jobs you were actually doing. A tab shows one job
and hides the other three; nothing was taken away. **Setup** stays above the
tabs, because the runtime owns that section and always puts it first, and the
**Export PNG** and **Export Video** buttons stay at the foot of every tab.

| Tab | Section | What it does |
| --- | --- | --- |
| — | Setup | The artboard: settings transfer, whether a background is drawn and its colour, infinity canvas, aspect ratio and size, and the preview's resolution scale |
| — | View | The tab bar itself. It renders the same four options as a select if the panel is ever too narrow for four cells |
| Product | Device | Which product the design is shown on, how it is turned, where it stands and its size |
| Product | Appearance | What the product itself looks like: a device's finish, and up to three colours for a merchandise product's own surfaces. Each colour picker appears only for a product that has that part |
| Design | Artwork | A panel picker, the design on the display, its position and stretch, and the runtime's rotate and flip actions |
| Design | Templates | The placeholder sheet each zone ships with, to draw a design over |
| Design | Fit & scale | Fit, fill or stretch, and a scale |
| Scene | Studio | The preset that sets a whole set at once, which captured room the product reflects, and how strongly that room lights it |
| Scene | Camera | Focal length as a full-frame equivalent, and zoom; drag the device itself to rotate |
| Scene | Framing | Where the subject sits in the picture, so you can leave room beside it for a headline. The projection shifts rather than the camera swinging, so nothing leans |
| Scene | Lights | A placed three-point rig on top of the environment: key intensity and colour, fill, rim, shadow softness and a pattern |
| Scene | Key light direction | Where the key sits, which rakes the light and swings the shadow |
| Scene | Surface | What the device stands on: none, stone, oak, steel or glass. Offered only for the devices a table suits |
| Scene | Backdrop | Sweep height and curve, the backdrop and floor lights, and the sweep's reflection and roughness |
| Output | Image Export | PNG or JPG, at a 2K, 4K or 8K long edge |
| Output | Video Export | MP4 or WebM, at the canvas size or 4K |
| — | Deliver | The Export PNG and Export Video buttons |

One pointer, three surfaces. Dragging **on the screen** moves the design across
it. Dragging **the body** rotates the device. Dragging **empty canvas** pans the
viewport. The split is decided on pointer-down by what the ray actually hits, so
there is no mode to switch.

Movement is measured in the screen's own UV space rather than in pixels, so the
design keeps up with the pointer even on a screen seen almost edge-on. An axis
that is not cropped has no slack and correctly does not move.

## Animation

The timeline is on, and it works in keyframes. A loop is six seconds by
default. That is one unhurried revolution, and it divides evenly into the
thirtieth-of-a-second frames a video export is cut into.

Most controls can be keyframed, so you can animate the device or the camera by
hand. There is also one preset, Turntable, which lays down a single track that
takes Spin from 0 to 360 degrees across the whole loop. That track is linear on
purpose. The editor's usual ease-in-out is right for a move that starts and
stops, and wrong for one that repeats, because the device would slow to a stop
at the top of the revolution and jerk as the loop came round again.

A design that moves runs on this clock whenever the clock runs, so a GIF on a
shirt and the turntable under it are the same six seconds and both come out of a
video export in step. With nothing keyframed the clock does not run and the
design keeps its own time instead. See **A design that moves** above.

Video export writes MP4 or WebM. The format you pick is the format you get.
Inside an MP4 the encoder prefers H.264, and it falls back to AV1 when the
browser has no H.264 encoder, which is the case on most Linux machines. WebM
uses VP9. The resolution ceiling is 4K rather than the 8K a still can reach,
because a six-second loop is a hundred and eighty frames and the same ceiling
would be a hundred and eighty times the work.

## Assets and licensing

- `public/hdri/*.hdr` — four 1K environment maps, CC0 from
  [Poly Haven](https://polyhaven.com). See
  [`public/hdri/CREDITS.md`](public/hdri/CREDITS.md) for the per-file mapping
  and why 1K is deliberate.
- `public/models/*.glb` — the device models listed above. `macbook.glb` carries
  the MacBook and the iMac in sibling scenes, so the two share one download.

Model provenance is not recorded anywhere in the repo. If these came from a
source with attribution or licensing terms, that belongs here before the site is
promoted anywhere public.

## Taking a supplied model as it is

A supplied GLB ships byte for byte and is repaired at load instead. Decimating
geometry to save bytes costs exactly the surface quality a mockup exists to
show, and every model has needed a different repair anyway, so the repairs are
catalog entries rather than a baked file.

The merchandise models are the exception, and what was done to them is not
decimation. Nothing was simplified: their UVs were rebuilt, because the ones
they shipped with were authored for a texture that is no longer on them, and a
mockup that cannot lay a design flat has nothing left to show. Every vertex
position is the one the file gave it — the tote is the single exception. Its
source is 301,100 triangles of subdivided cage and a fifth of it is kept, which
is decimation, chosen because the alternative was a flatter bag.

The t-shirt ships without its topstitch: 590,408 triangles of thread over
thirty-five meshes, 96 per cent of the model and the whole reason the file was
22MB. `scripts/clean-model.mjs --keep-geometry --drop-material` removes them,
and every surviving surface has the vertices and the precision the file gave
it, so this is deletion rather than decimation. The test of whether that is
worth doing is whether the part removed is a part rather than a density.

What it costs is real: a close crop of a raglan seam or a cuff shows no
stitching. It was removed, restored, and removed again over this branch, and
the second removal was decided on the reference rather than on the file — the
garment being matched has no visible seams, and 6.1MB against 23MB is the
difference between a model that loads and one that is waited for.

`mac-studio.glb` is the worked example. It arrived at 3.4MB, which flattered
it: that is Draco compression over 502,646 triangles, 34.8MB once decoded. The
loader carries a Draco decoder (`public/draco`, WebAssembly, on a worker) so
the file needs neither decompressing nor decimating.

Three things about it are declared in
[`src/app/product-domain.ts`](src/app/product-domain.ts) and applied by the
scene builder:

- **`sceneName`** — the file carries a second scene built around a 22-metre
  studio backdrop. The app brings its own ground and lighting, so it loads the
  one it wants.
- **`creaseAngleDegrees`** — its flat panels are welded to their rounded
  bevels, so the corner normals hold an average of both and the flat face
  shades as a gradient between them. The giveaway is a soft fan spreading from
  a corner rather than a highlight where the light is. Normals are recomputed
  with a crease threshold, which gives flat faces one normal each and leaves
  the fillets smooth.
- **`screenUnwrap`** — the display is mapped into a corner of a shared atlas,
  u from 0.02 to 0.45. Fine for a wallpaper baked into the file, useless for a
  design supplied at runtime, so the panel is re-unwrapped from its geometry.

[`scripts/clean-model.mjs`](scripts/clean-model.mjs) does both jobs. Its
`--drop-material` removes every mesh painted with a named material, and
`--keep-geometry` skips the welding, simplification and quantisation so the
surfaces that remain are untouched. Its simplifier still exists for a model that
genuinely needs reducing, and is not on the path any model takes by default.

## Sharpness

Three things decide how much detail survives, and all three were losing some.

**Export resolution.** The runtime hands the product renderer a frame in CSS
units and a separate pixel ratio, having already scaled the destination context
by that ratio. Rendering at the CSS size and letting `drawImage` stretch the
result is an upscale: a 2x export carried half the detail it claimed. The ratio
is applied to the render instead, so every pixel in the artifact is one the
renderer drew. Measured on a 3277x4096 export of a one-pixel grid, edge energy
per pixel went from 6.98 to 13.61.

**Anisotropy.** A display is almost never seen square on, and a foreshortened
surface sampled without anisotropic filtering takes a mip level chosen for its
narrowest axis, so the whole panel blurs to match the most compressed
direction. Screen textures now request the highest anisotropy the context
supports.

**Preview resolution.** Full sharpness is the default, dragging included.
Resolution only drops once frames have actually been late, and climbs back as
soon as they are not — see the adaptive policy in `adaptive-quality.ts`.
Resolution scale lowers the ceiling; it cannot raise it, because a display
cannot show more pixels than it has.

## Known issues

`npm test` passes. It runs the docs check, 702 script tests and 638 unit
tests. What it does not run is `check-toolcraft-integrity`, which sat second in
the chain and failed, so for a long time none of the tests after it ran at all
and nobody could see what they said. Splitting them is the framework's own
arrangement rather than a local invention: a generated app may publish `test`
as the suite and `test:generated` as the same suite behind the integrity check,
and `app-performance.lifecycle.test.ts` holds both to their exact wording.

`npm run test:generated` still fails, and so does `npm run ai:check`. One file
and three imports: `src/app/render/device-assets.ts` imports `DRACOLoader`,
`GLTFLoader` and `RGBELoader` from three.js, which product code is not allowed
to do.

Running the suite immediately turned up something the red check had been hiding.
The runtime evidence reporter requires a named automated test per acceptance
requirement, and one was missing — `artwork.image.upload` named a test that did
not exist. It exists now, in `artwork-upload.test.ts`, and holds what the
requirement means today: exactly one control writes each upload slot, all four
are `fileDrop`s, and a slot exists for exactly the zones the catalog declares.

The approved way to load a model is a `fileDrop` control in the schema, and it
cannot hold what this app ships. Every entry in `media.defaultAssets` carries
its file contents inline as a `dataUrl` string, so the model files and the
environment maps would have to sit in the bundle as base64 text. Those files
come to about 41MB. Beyond the size, the pipeline behind that control is built
for a model a user drops: it hands back canonical data rather than a live
three.js graph, where this app's catalog is written entirely in the author's own
material names -- `screenMaterial: "Bag_Front"`, `colorParts`, `excludedNodes` --
and its studio is 625 lines of cove, mirror floor, three lights and a turntable.
Moving to it is a rewrite of the render path rather than a boundary fix.

The integrity check also reports 57 framework-owned files that no longer match
the signed manifest. They break down like this:

- 37 files under `src/toolcraft/`
- 10 files under `e2e/`
- 4 files under `scripts/`
- 3 files under `src/app` and `src/routes`
- 2 files under `docs/toolcraft`
- `index.html`

Every one of those changes was deliberate. You can find the reasoning for each
one in [`agent-worklog.md`](docs/toolcraft/agent-worklog.md).

`npm run verify:delivery` has never passed, and nothing done inside this
repository can make it pass. It stops at the same integrity check, so none of
the later stages run. Those stages are the build, the unit tests and the browser
tests. The manifest is signed, so only the holder of the framework's private key
can reissue it. The 37 changed files under `src/toolcraft/` are written out as a
patch at
[`timeline-and-runtime.patch`](docs/toolcraft/upstream/timeline-and-runtime.patch),
so whoever reissues the manifest can review those changes instead of working out
what they were.

`RGBELoader` is deprecated in three.js 0.185. It still works. You will see a
warning in the console each time an environment map loads. `HDRLoader` replaces
it.

## Repository layout

- `src/app` — the product: schema, controls, renderer, export, and the Toolcraft
  acceptance and performance contracts.
- `src/toolcraft` — an immutable signed copy of the Toolcraft runtime. Do not
  edit it; fix the framework and regenerate.
- `docs/toolcraft` — the local contract documents, plus
  [`agent-worklog.md`](docs/toolcraft/agent-worklog.md), which records the
  product decisions and the evidence behind them.
- `public/models` — the GLBs, and `public/templates` — a placeholder image
  for every print zone, which is also what each model renders before an upload.
- `src/app/product-applicability.ts` — which products offer which controls,
  computed from the catalog so a slot and its control cannot disagree.
- `legacy/procedural-scenes` — superseded code that built devices from geometry
  before real GLB models arrived. Kept outside `src/` deliberately so the
  code-health gates do not scan it.

## Performance note

Lighting is image-based rather than traced. Shadows come from a single
directional shadow map instead of true area-light occlusion, reflections sample
the environment map only, and depth of field is not simulated. The trade is
interaction: a path-traced version restarts a convergence on every camera move
and holds the GPU at full load for seconds, where this stays at frame rate while
you move it around.

The largest cost is loading a device and convolving its environment, not the
frames that follow.
