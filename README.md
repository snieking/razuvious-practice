# Razuvious practice

A browser game for priests practicing Mind Control on Instructor Razuvious in WoW Classic Era.

[Play the trainer](https://snieking.github.io/razuvious-practice/)

The pull drill covers Mind Soothe, safe positioning, reading the patrol, and taking control without moving too soon. The handoff drill covers taking a free understudy and using Shield Wall and Taunt before the outgoing priest loses protection.

## Controls

| Input | Action |
| --- | --- |
| Click an enemy or Tab | Select a target |
| W, A, S, D or arrow keys | Move the priest or the controlled understudy |
| 1 | Mind Soothe |
| 2 | Mind Control |
| 3 | Shield Wall |
| 4 | Taunt |
| 5 | Pet attack |
| F | Mind Control macro |
| H | Cast a priest heal, which breaks Mind Control |
| Escape | Break Mind Control |
| P | Pause or resume |
| R | Restart |

The trainer also supports clickable abilities and touch movement. Settings let you adjust control registration delay, handoff timing, an initial Mark of the Wild buff, and optional simulated resists.

Use Guided mode to learn with range circles and prompts. Raid night hides the range aids and randomizes the patrol's starting point. Progress stays in the browser.

## Mechanics and limits

The trainer uses Classic Era timings for Shield Wall and Taunt. It models a 3-second Mind Control cast followed by a configurable registration pause. Casting a priest spell or pressing Escape while controlling an add breaks the channel.

The room, patrol, detection radii, movement, line of sight, damage, and healing are approximations. Random heartbeat breaks and full raid threat tables are not simulated. Optional resists use an exaggerated training rate. The in-game Field guide lists the sources and assumptions.

## Run locally

No build or package installation is needed. Serve `docs/` over HTTP so the browser can load the JavaScript module.

```fish
python3 -m http.server 8767 --directory docs
```

Open http://localhost:8767 in a browser.

## Publish

GitHub Pages serves the `docs/` directory from the `main` branch. Pushing changes to `main` publishes them automatically. The `.nojekyll` file keeps the site static.

## Credits

Three.js is distributed under the MIT license. Its license is included in `docs/vendor/THREE-LICENSE.txt`.

Spell icons are Blizzard game assets supplied by Wowhead. World of Warcraft belongs to Blizzard Entertainment. This is an independent practice tool.
