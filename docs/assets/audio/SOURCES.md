# Razuvious voice recordings

Original English World of Warcraft voice recordings by Blizzard Entertainment, from the Classic NPC's [Sounds list on Wowhead](https://www.wowhead.com/classic/npc=16061/instructor-razuvious#sounds). The recordings were converted from OGG to MP3 for browser playback. No speech is synthesized.

| Trainer file | Original recording | Sound kit | Caption |
| --- | --- | --- | --- |
| razuvious-taught.mp3 | [RAZ_NAXX_CMMND01.ogg](https://wow.zamimg.com/sound-ids/classic/enus/138/558986/RAZ_NAXX_CMMND01.ogg) | 8855 | Do as I taught you! |
| razuvious-mercy.mp3 | [RAZ_NAXX_CMMND02.ogg](https://wow.zamimg.com/sound-ids/classic/enus/141/558989/RAZ_NAXX_CMMND02.ogg) | 8856 | Show them no mercy! |
| razuvious-warmed.mp3 | [RAZ_NAXX_AGGRO01.ogg](https://wow.zamimg.com/sound-ids/classic/enus/140/558988/RAZ_NAXX_AGGRO01.ogg) | 8852 | Hah hah, I'm just getting warmed up! |
| razuvious-stand.mp3 | [RAZ_NAXX_AGGRO02.ogg](https://wow.zamimg.com/sound-ids/classic/enus/139/558987/RAZ_NAXX_AGGRO02.ogg) | 8853 | Stand and fight! |
| razuvious-show.mp3 | [RAZ_NAXX_AGGRO03.ogg](https://wow.zamimg.com/sound-ids/classic/enus/145/558993/RAZ_NAXX_AGGRO03.ogg) | 8854 | Show me what you've got! |
| razuvious-disappoint.mp3 | [RAZ_NAXX_CMMND03.ogg](https://wow.zamimg.com/sound-ids/classic/enus/147/558995/RAZ_NAXX_CMMND03.ogg) | 8858 | You disappoint me, students! |
| razuvious-death.mp3 | [RAZ_NAXX_DEATH.ogg](https://wow.zamimg.com/sound-ids/classic/enus/143/558991/RAZ_NAXX_DEATH.ogg) | 8860 | An honorable... death. |

The dialogue and sound-kit mapping was cross-checked against [AzerothCore's Razuvious creature text data](https://github.com/azerothcore/azerothcore-wotlk/blob/master/data/sql/old/db_world/4.x/2021_03_23_00.sql). This verifies the recording identities, rather than asserting current Classic server timing.

In this trainer, the death recording accompanies attempts ending in a priest, raid member or understudy death, as requested. In the original encounter it is Razuvious's own death line. Nonfatal failures use the students reprimand. Engagement and taunt lines play at their corresponding practice events. Audio starts muted on every page load; the combat log always shows the dialogue.

## Spell effects

These original Blizzard effects are listed in the Sounds tabs for the actual Classic spells: [Mind Soothe, 10953](https://www.wowhead.com/classic/spell=10953/mind-soothe#sounds), [Mind Control, 10912](https://www.wowhead.com/classic/spell=10912/mind-control#sounds), [understudy Shield Wall, 29061](https://www.wowhead.com/classic/spell=29061/shield-wall#sounds), and [understudy Taunt, 29060](https://www.wowhead.com/classic/spell=29060/taunt#sounds). They were converted to MP3 from the linked recordings.

| Trainer file | Original recording | Sound kit | Practice event |
| --- | --- | --- | --- |
| spell-shadow-precast.mp3 | [PreCastShadowMagicLow.ogg](https://wow.zamimg.com/sound-ids/classic/enus/80/569424/PreCastShadowMagicLow.ogg) | 745 | While Mind Control is casting; stops at completion or interruption |
| spell-shadow-cast.mp3 | [ShadowCast.ogg](https://wow.zamimg.com/sound-ids/classic/enus/166/569766/ShadowCast.ogg) | 2560 | Mind Control lands, or instant Mind Soothe is cast successfully |
| spell-mind-soothe.mp3 | [ShadowWordFumble.ogg](https://wow.zamimg.com/sound-ids/classic/enus/63/569407/ShadowWordFumble.ogg) | 3156 | Mind Soothe is applied to the target |
| spell-shield-wall.mp3 | [DefensiveStance.ogg](https://wow.zamimg.com/sound-ids/classic/enus/190/568510/DefensiveStance.ogg) | 3660 | Understudy Shield Wall activates |
| spell-taunt.mp3 | [Taunt.ogg](https://wow.zamimg.com/sound-ids/classic/enus/204/568268/Taunt.ogg) | 3216 | Understudy Taunt succeeds |

The generic shadow pre-cast and release recordings are shared by Mind Soothe and Mind Control in Classic's spell data. Mind Soothe is instant, so the trainer uses its release and target effect without a charging sound. Spell effects can overlap boss dialogue. Failed, out-of-range or cooldown-blocked actions do not play successful spell effects.
