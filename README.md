# Razuvious practice

A browser game for priests practicing Mind Control on Instructor Razuvious in WoW Classic Era.

[Play the trainer](https://snieking.github.io/razuvious-practice/)

The pull drill covers Mind Soothe, the clockwise patrol, safe positioning, and taking control without moving too soon. The handoff drill varies which understudy is available. Two adds begin with Mind Exhaustion, while the outgoing priest controls another. Check debuffs and choose the remaining add before using Shield Wall and Taunt. The priest starts at the left edge of the open ramp, with the raid on the upper platform. The handoff starts with Razuvious already behind the left wall and the available adds visible from the ramp. Both drills require keeping Razuvious out of the mana users' line of sight.

The interface follows the Classic layout: player, target and pet frames, a minimap, combat log, gold cast/channel bar, priest action bar, and a priest bar containing only Mind Soothe and the MC macro. The third-person camera transfers to the understudy as soon as MC lands. Stand still for about 1 second after that switch while control registers. Room and character models are procedural approximations.

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

Settings include A/D strafing, control registration delay, handoff timing, optional simulated resists. Guided mode shows the current objective, range circles and prompts. Raid night hides those aids and randomizes the patrol's starting point. Progress stays in the browser.

## Macro

Each drill opens with the exact macro and instructions. Copy it into WoW and bind it to the same key used in the trainer.

```text
#showtooltip
/cast [nopet,harm] Mind Control
/targetexact [pet] Instructor Razuvious
/targetexact [pet] Grand Widow Faerlina
/petattack
/cast Shield Wall
/cast Taunt
/cast Widow's Embrace
```

On the pull, Soothe A before approaching from the left. On the handoff, your partner controls A. Check the other adds for Mind Exhaustion and select one without it. Select the free understudy and press the macro once to cast MC. When the 3-second cast lands, the camera and pet frame immediately transfer to the understudy. Keep standing still for about 1 second after that switch while control registers. Press the same macro again. It automatically targets Razuvious, orders an attack, and uses Shield Wall and Taunt. Repeat when he is within 5 yd. The Faerlina lines have no effect in this encounter.

## Mechanics and limits

Mind Control has a 3-second cast, 20 yd casting range, and a 60-second channel. Initial casting requires line of sight. Losing line of sight after possession does not automatically break the channel. Casting a priest spell or pressing Escape breaks MC. Moving during the registration pause breaks MC even though the camera has already transferred to the understudy.

The understudy's Shield Wall reduces damage by 75% for 20 seconds with a 30-second cooldown. Taunt has a 5 yd range, forces attacks for 20 seconds, and has a 60-second cooldown. Taunt expiry does not automatically remove threat. The pull ends immediately once the understudy has Shield Wall and Taunt active and Razuvious is behind cover. Its completion screen offers the handoff next. The handoff verifies six seconds of covered tanking after takeover. They do not require healing or healer visibility to the understudy.

Mind Exhaustion prevents another Mind Control for 60 seconds after control ends. Its countdown appears on the target frame and above the add's nameplate. The handoff starts with one occupied add, two recently released adds, and one available add. Exhaustion counts down while the drill runs.

Taunt and Mind Soothe also show timed debuff icons on the target frame and above NPC nameplates.

Disrupting Shout recurs about every 25 seconds and punishes mana users in the boss's line of sight. The handoff starts eight seconds before a shout to make cover matter during an existing fight. The circular room wall continues to both ramp corners, leaving only the central entry open. Cover and movement checks use the same wall footprints as the rendered ramp rails, corner pillars and outer walls. The open center of the ramp still exposes mana users.

Room scale, the precise patrol route, detection radii, movement, collision, line of sight, and damage are estimates. The registration pause defaults to 1 second after the cast and is adjustable from 0.8 to 1.2 seconds for practice. The simulated 100 yd possession limit comes from original-era notes and is not a verified current-server cutoff. Optional resists use an exaggerated 10% training rate. Random heartbeat breaks and full raid threat tables are not simulated.

## Sources

- [Wowhead Classic Razuvious encounter guide](https://www.wowhead.com/classic/guide/instructor-razuvious-naxxramas-raid-strategy)
- [Classic Taunt spell data](https://www.wowhead.com/classic/spell=29060/taunt)
- [Classic Shield Wall spell data](https://www.wowhead.com/classic/spell=29061/shield-wall)
- [Classic encounter notes and Mind Exhaustion](https://warcraft.wiki.gg/wiki/Instructor_Razuvious_(Classic))
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

Sniekin-Pyrewood Village.

Three.js is distributed under the MIT license. Its license is included in `docs/vendor/THREE-LICENSE.txt`.

Spell icons are Blizzard game assets. The Mind Soothe and Taunt icons use the supplied reference images; other icons come from Wowhead. World of Warcraft belongs to Blizzard Entertainment. This is an independent practice tool.
