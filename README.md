# Gate to Gate

A day in the life of an airport in 2035, as a living organism. A Three.js film in eight chapters that you can stop, scrub, grab and take apart. Everything is procedural: no models, no textures, no audio files.

## Run it

```bash
npm install
npm run dev
```

`npm run build` makes a static site in `dist/` (serve it with `npm run preview`). Stack: `three@0.186.1` (pinned) and Vite 8, built on the conventions in `../THREEJS_PLAYBOOK.md`.

## The film

| # | Chapter | What happens | Signature controls |
|---|---|---|---|
| 1 | Dawn | Wide aerial at sunrise; runway lights fade; time-lapse flights draw trails | time-lapse rate, flights/min, trail length/linger/width/colours |
| 2 | Airport x-ray | The ground turns to glass and the hidden networks come alive. **Click the ground** to open the x-ray there | radius, edge, glass opacity/tint, schematic grid, flow rate, depth peel, six network layers |
| 3 | Follow the bag | Ride one suitcase: check-in, chute, CT scan (see-through), sorter maze, cart, belt loader, hold | ride speed, chase/side/top/POV camera, bag colour, tag, CT palette, sorter speed |
| 4 | Turnaround ballet | GSE converge on a 50-minute schedule with a 3D timeline ring; a late inbound makes the AI replan on blocks | inbound delay, AI replanning on/off, sim speed, vehicle paths and labels, countdown |
| 5 | The aircraft | Airframe x-ray (structure, cabin, cargo, wiring, hydraulics, avionics, fuel), then the engine in glass or thermal view | x-ray amount, skin opacity, cutaway plane, system layers, engine view, fan speed |
| 6 | The hangar | Drones sweep the fuselage with structured light; the digital twin materialises and flags a part | drone count, scan speed, beams, hex grid, twin placement/colour/opacity, flagged part |
| 7 | Digital tower | The cab dissolves into a remote ops room; every aircraft gets a label and a predicted path, conflicts in amber | dissolve, label mode, prediction horizon, conflict distance, radar sweep, data links, traffic rate |
| 8 | The future sky | Air taxis on the roof vertiport, then a sky full of tracked paths by altitude | air-taxi count/speed, path density, corridors, pad lights, loop |

Global tabs: **World** (time of day, simulation speed, background traffic, airfield light groups), **Camera** (film vs free camera, FOV, depth of field, shot jump list), **Look** (quality tier, AO, bloom, exposure, vignette, grain, colour wash, accent, presets), **Vitals** (live readings and the activity pulse).

Keys: `space` play · `← →` chapters · `1–8` jump · `F` film camera · `X` x-ray · `C` controls · `H` hide UI · `S` save frame · `L` copy link · `M` sound · `N` narration · `?` help. Dragging the view takes the camera at any time.

URL state: `#ch=4&t=12&q=high&free=1&pause=1`.

## Layout

```
src/
  main.js                 bootstrap, settings, loop, resize, interaction
  app/   director.js (chapter sequencing, shots, captions, params), camera.js (rig), ui.js (schema-driven panel),
         labels.js (HTML labels + leaders), state.js (schemas, persistence), audio.js (synth ambience, narration)
  core/  rng.js, tween.js, geo.js (lofts, tubes, merge), canvas.js (painters), curves.js (speed paths)
  world/ layout.js (every constant), materials.js (x-ray, flow, scan, thermal, dissolve, hologram patches),
         textures.js, sky.js, lighting.js, ground.js, terminal.js, underground.js, lights.js (one Points draw),
         aircraft.js (hero, systems, engine detail, twin, lite swarm), vehicles.js, baggage.js, traffic.js
  fx/    post.js (GTAO, DoF, bloom, finish + wash), trails.js (camera-facing ribbons)
  chapters/ ch1…ch8      each: shots, captions, params schema, enter/update/exit, panel
```

## Techniques worth lifting

- **Glass-floor x-ray** as an `onBeforeCompile` patch on every ground material: radial wipe in world space, alpha + roughness + rim ring + schematic grid, `transparent` toggled at runtime (no recompile). The same patch runs on the hero airframe.
- **Flow pulses** on tubes whose `uv.x` is rescaled to metres, so pulses travel at a real speed after merging.
- **Speed-profiled paths** (`SpeedPath`): waypoint speeds integrated over arc length, so taxi, roll, climb and bag belts move believably and scrub deterministically.
- **One Points draw** for ~900 airfield lights with per-light modes (steady, sequenced flashers, pulse, strobe) and group brightness.
- **Trail ribbons** billboarded in the vertex shader with a moving head; mode 1 draws the predicted stretch ahead.
- **Thermal engine** as a local-z temperature profile mapped through a palette, mixed into `outgoingLight`.
- **Hologram twin** reveals tail-to-nose with the scan; flaggable parts are `mergeBoundary` groups with their own material clone.
- **Turnaround planner**: declarative task table, a naive plan that slides with the delay and an AI template that parallelises; the 3D ring and the HTML Gantt both read the same plan.

## Measured (1024×768 pane, high quality, pixel ratio 1.5)

| Chapter | Drawables in the scene graph | GL draw calls per frame (shadow + AO prepass + beauty + post) |
|---|---|---|
| Dawn (time-lapse, ~24 trails) | ≈265 | ≈590 |
| Airport x-ray (networks on) | ≈280 | ≈370 |
| Turnaround (15 GSE vehicles + ring) | ≈415 | ≈650 |
| Future sky (900 paths, 8 air taxis) | ≈265 | ≈420 |

Programs ≈110 (two variants of the x-ray materials are warmed at load), textures ≈63, no console errors through a full loop of the film. Medium quality drops the AO prepass and roughly halves the calls.

## A playbook correction found while building this

Since three r152, a material compiled with `transparent: false` bakes an `OPAQUE` define that forces alpha to 1. Flipping `material.transparent` at runtime therefore **does** need `material.needsUpdate = true` (it is not a pure render state as §5 of the playbook assumes). `setTransparent()` in `src/world/materials.js` does this, and both program variants are compiled during loading so the x-ray never hitches.
