# Skyward Flight

A small original flight game for the desktop browser. Fly a little yellow
plane out of a green valley, thread the orange rings, mind the fuel and the
wind, and land back on the runway you took off from.

## How to play

- **Take off:** hold `W` (or `Shift`) to spool the throttle up, then pull
  back on `↑` once the speed passes 60 knots. The plane lifts off the
  runway on its own from there.
- **Fly:** `↑` / `↓` pitch the nose up and down, `←` / `→` bank and turn.
  `W` / `S` (or `Shift` / `Ctrl`) work the throttle. The mouse steers too:
  hold the mouse button and move it, and the plane follows.
- **The course:** fly through every orange ring, then land on the runway.
  Each ring is worth 250 points. A gentle touchdown on the strip pays 500,
  plus a bonus for the fuel you bring home and for the time you save.
- **The catch:** fuel burns the whole sortie, and the wind pushes the plane
  sideways — hold a little into it on final, the way a real pilot crabs.
  Land too fast, too steep, or off the strip, and the valley wins.
- **After landing:** press `R` for the next level — more rings, tighter
  turns, stronger wind. `P` pauses. The best score is kept in the browser.

## How to run it

No build step, no network request. Serve the `game/` folder with any static
server and open it in a desktop browser:

```sh
cd game
python3 -m http.server 8080
# open http://localhost:8080
```

Or with Node 22 or newer, from the repository root:

```sh
node serve.ts
```

`?seed=N` fixes the valley and the course, so the same seed always flies
the same rings. `?shot=start|play|end&seed=N` stages one scene for a
screenshot instead of running the loop.

## What is in the game

- `game/index.html` — the page, one canvas and a status line.
- `game/src/config.js` — tuning, levels and the palette.
- `game/src/random.js` — the seeded random stream and value noise.
- `game/src/terrain.js` — the valley: hills, river, trees, runway, rings.
- `game/src/flight.js` — the flight model and the sortie: rings, fuel,
  landings and crashes.
- `game/src/render.js` — the chase view and the lit instruments.
- `game/src/audio.js` — engine, wind and ring sounds, made in the browser.
- `game/src/input.js` — keyboard and mouse.
- `game/src/shots.js` — the staged screenshot scenes and the autopilot.
- `game/src/main.js` — boot and the one loop.

Everything is original: the art is drawn on the canvas, the sounds are
synthesised, and no library is used. The entry is handed in by `main.ts`,
which copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored make.fun library.

## License

MIT — see `LICENSE`.
