# Razuvious practice

A browser game for priests practicing Mind Control on Instructor Razuvious in WoW Classic Era.

[Play the trainer](https://snieking.github.io/razuvious-practice/)

The pull drill covers Mind Soothe, the clockwise patrol, safe positioning, and taking control without moving too soon. The handoff drill covers taking a free understudy and using Shield Wall and Taunt before the outgoing priest loses protection. The priest and raid start on the left side of the ramp. Both drills require keeping Razuvious out of the mana users' line of sight.

The interface follows the Classic layout: player, target and pet frames, a minimap, combat log, gold cast/channel bar, priest action bar, and a priest bar containing only Mind Soothe and the MC macro. The third-person camera transfers to the understudy after control registers. Room and character models are procedural approximations.

## Controls

Ability bindings are configurable and saved in the browser. Match them to the keys used in your raid.

| Default input | Action |
| --- | --- |
| Click an enemy body, marker or nameplate, or Tab | Select a target |
| W / S | Forward / backward |
| A / D | Turn left / right |
| Q / E | Strafe left / right |
| Hold right mouse + move mouse | Steer the character and tilt the camera |
| A / D while right mouse is held | Strafe left / right |
| Hold both mouse buttons | Move forward while steering |
| Left mouse drag | Orbit the camera |
| Mouse wheel | Zoom the camera |
| 1 | Mind Soothe |
| 5 | Mind Control macro |
| F | Additional macro key unless rebound |
| Escape | Cancel Mind Control |
| P | Pause or resume unless rebound |
| R | Restart unless rebound |

NPCs have generous selection regions around their bodies and nameplates, with hover feedback. Held right-click uses relative mouse movement where the browser supports pointer lock, so steering continues beyond the screen edge. Releasing right-click restores the cursor. The buttons also work with mouse or touch. Only Mind Soothe and the macro are available as spell buttons. The macro uses the understudy abilities internally.

Settings include A/D strafing, control registration delay, handoff timing, an initial Mark of the Wild buff, and optional simulated resists. Guided mode shows the current objective, range circles and prompts. Raid night hides those aids and randomizes the patrol's starting point. Progress stays in the browser.

## Macro

Each drill opens with the exact macro and instructions. Copy it into WoW and bind it to the same key used in the trainer.

```text
#showtooltip Mind Control
/cancelaura Mark of the Wild
/cancelaura Gift of the Wild
/cast [nopet,harm] Mind Control
/petattack
/cast Shield Wall
/cast Taunt
```

On the pull, Soothe A before approaching from the left. On the handoff, your partner controls A and B is free. Select the free understudy and press the macro once to cast MC. Stand still until the cast and registration pause finish, the camera transfers, and the pet frame appears. Select Razuvious and press the same macro again to attack, Shield Wall and Taunt. Repeat when he is within 5 yd. The macro does not select the boss automatically.

## Mechanics and limits

Mind Control has a 3-second cast, 20 yd casting range, and a 60-second channel. Initial casting requires line of sight. Losing line of sight after possession does not automatically break the channel. Casting a priest spell or pressing Escape breaks MC. Moving before possession registers moves the priest and breaks MC.

The understudy's Shield Wall reduces damage by 75% for 20 seconds with a 30-second cooldown. Taunt has a 5 yd range, forces attacks for 20 seconds, and has a 60-second cooldown. Taunt expiry does not automatically remove threat. The drills hold the boss safely for six seconds after takeover. They do not require healing or healer visibility to the understudy.

Disrupting Shout recurs about every 25 seconds and punishes mana users in the boss's line of sight. The handoff starts eight seconds before a shout to make cover matter during an existing fight.

Room scale, the precise patrol route, detection radii, movement, collision, line of sight, and damage are estimates. The configurable 200–600 ms registration pause is a practice delay. The simulated 100 yd possession limit comes from original-era notes and is not a verified current-server cutoff. Optional resists use an exaggerated 10% training rate. Random heartbeat breaks and full raid threat tables are not simulated.

## Sources

- [Wowhead Classic Razuvious encounter guide](https://www.wowhead.com/classic/guide/instructor-razuvious-naxxramas-raid-strategy)
- [Classic Taunt spell data](https://www.wowhead.com/classic/spell=29060/taunt)
- [Classic Shield Wall spell data](https://www.wowhead.com/classic/spell=29061/shield-wall)
- [Classic Mind Soothe spell data](https://www.wowhead.com/classic/spell=10953/mind-soothe)
- [First-hand Classic priest reports about MC and line of sight](https://www.reddit.com/r/classicwow/comments/lbwj6q/mind_control_on_razuvious_breaking_from_los/)
- [Warcraft Wiki channeling notes](https://warcraft.wiki.gg/wiki/Channeling)
- [Sage Guide room and ramp positioning reference](https://www.sageguide.net/naxxramas)

The channel LOS rule follows Classic priest reports and channeling documentation. No Blizzard statement specific to Razuvious MC was found. The in-game Field guide includes these sources and the training assumptions.

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

Spell icons are Blizzard game assets. The Mind Soothe icon uses the supplied reference image; other icons were supplied by Wowhead. World of Warcraft belongs to Blizzard Entertainment. This is an independent practice tool.
