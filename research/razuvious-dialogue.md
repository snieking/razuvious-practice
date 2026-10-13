# Razuvious dialogue audit for level-60 Naxxramas

Researched 2026-10-13. The target is Vanilla and WoW Classic Era, not the level-80 Wrath encounter.

This audit describes trainer commit `53cbcb4`, before the dialogue correction. The subsequent implementation adopts CMaNGOS Classic as requested: four engagement recordings, four Taunt responses including disappointment, no engagement quote on handoff Begin, and no new quote on nonfatal failure. Fatal failures keep the requested death-line override.

The existing pull and Taunt categories have support in a Vanilla-specific implementation, CMaNGOS. The earlier AzerothCore Wrath SQL was insufficient evidence for Classic. CMaNGOS and VMaNGOS disagree, and neither is Blizzard's current server code. The precise Classic Era trigger distribution remains unconfirmed.

## What the Vanilla source implements

CMaNGOS changed this encounter in September 2019. Its [correction commit](https://github.com/cmangos/mangos-classic/commit/9bd2b850ee56a75d0f06ef2b718f4e344359b153) moved dialogue to the understudy's Taunt and moved the disappointment line out of the kill handler. A [follow-up commit](https://github.com/cmangos/mangos-classic/commit/eba3275f3a7c42358f0155e8ccdc2a87600630b7) corrected the speaker from the understudy to Razuvious. The commits contain no linked sniff or gameplay evidence. The same event categories survive in the [2025 Vanilla script](https://github.com/cmangos/mangos-classic/blob/e24155ae0f62b4b4a662b7156604c0aafbd6dd8e/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L30-L80).

Sound IDs below come from the [matching Vanilla dialogue database](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/sql/scriptdev2/scriptdev2.sql#L2458-L2467). Confidence is high in this interpretation of the source, moderate that all of it matches Blizzard Classic Era.

| Event | CMaNGOS Vanilla mapping | Consequence for this trainer |
| --- | --- | --- |
| Actual combat engagement | Random choice of 8855, 8856, 8859 or 8861: taught, mercy, practice-over or sweep-the-leg. [Aggro handler](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L109-L121) | 8855 on engagement is supported as one possible pull line. It is not the only one. |
| Understudy Taunt hits Razuvious, spell 29060 | Random choice of 8852, 8853, 8854 **or 8858**: warmed-up, stand-and-fight, show-what-you-have or disappointment. [Taunt handler](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L74-L87) | The existing three Taunt lines are supported, but this reconstruction includes a fourth. It reacts to the spell hitting, not specifically to the local trainee clicking Taunt or changing tank. |
| Razuvious kills a player | 8862, the stayed-home line. The current base handler filters for players and uses a 10-second reaction cooldown. [Kill handler](https://github.com/cmangos/mangos-classic/blob/e24155ae0f62b4b4a662b7156604c0aafbd6dd8e/src/game/AI/ScriptDevAI/base/CombatAI.cpp#L94-L108) | This is separate from an MC break or a failed practice step. |
| Razuvious kills an understudy | The 2019 handler did not filter the victim type. The current base handler does filter for players. [Older handler](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L69-L72) | Source history does not establish a reliable Classic Era NPC-kill response. |
| Razuvious dies | 8860, the honorable-death line. [Death handler](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L99-L107) | Viktor explicitly requested this line for fatal practice failures. Keep it as a trainer override. |
| Nonfatal wipe, evade, reset or MC break | No specific spoken line in the checked CMaNGOS boss script. Its [reset handler](https://github.com/cmangos/mangos-classic/blob/eba3275f3a7c42358f0155e8ccdc2a87600630b7/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/naxxramas/boss_razuvious.cpp#L123-L127) only marks failure. | 8858 on every nonfatal failure lacks encounter-trigger support. |
| Handoff practice's Begin button | No equivalent encounter event. | 8856 on Begin is a trainer choice. CMaNGOS places it in the combat-engagement pool. |

## The conflicting reconstruction

The [VMaNGOS Vanilla script](https://github.com/vmangos/core/blob/53d24d5c748bef5e0cde7b1155bcb3d979af614c/src/scripts/eastern_kingdoms/eastern_plaguelands/naxxramas/boss_razuvious.cpp#L17-L40) still says its timers and sounds need confirmation. It plays 8852/8853/8854 on engagement, has no Taunt handler, and uses 8855/8856/8858/8859 as periodic commands. Its [first command is scheduled at 40 seconds](https://github.com/vmangos/core/blob/53d24d5c748bef5e0cde7b1155bcb3d979af614c/src/scripts/eastern_kingdoms/eastern_plaguelands/naxxramas/boss_razuvious.cpp#L214-L228), then [repeats after 30 to 60 seconds](https://github.com/vmangos/core/blob/53d24d5c748bef5e0cde7b1155bcb3d979af614c/src/scripts/eastern_kingdoms/eastern_plaguelands/naxxramas/boss_razuvious.cpp#L336-L339). Its [kill handler](https://github.com/vmangos/core/blob/53d24d5c748bef5e0cde7b1155bcb3d979af614c/src/scripts/eastern_kingdoms/eastern_plaguelands/naxxramas/boss_razuvious.cpp#L199-L211) instead randomly uses 8861 or 8862 on one quarter of kills. The [Vanilla database migration](https://github.com/vmangos/core/blob/e8b603fe22e69fbe6c5df8ea9c47d2c297f936cd/sql/migrations/20200807012348_world.sql) confirms those sound-ID pairings.

CMaNGOS has no periodic command timer in either checked version. VMaNGOS's 40-second timer should not be presented as established Classic behavior. The older [2016 CMaNGOS discussion](https://github.com/cmangos/mangos-classic/pull/219#issuecomment-262529899) also records uncertainty about Razuvious's dialogue and reliance on a wiki.

The [2021 AzerothCore SQL](https://github.com/azerothcore/azerothcore-wotlk/blob/master/data/sql/old/db_world/4.x/2021_03_23_00.sql#L45-L61) belongs to the Wrath project. Its five-line Taunt pool also includes 8862. That extra line is absent from the checked CMaNGOS Vanilla Taunt pool, so it should not be imported on that evidence alone.

## Client filenames and gameplay evidence

Historical [BossTalk source dated August 2008](https://groups.google.com/g/wowace/c/BXJmf0aK_z0), before Wrath's Naxxramas replacement, calls the client sound API with these names under `Sound\\Creature\\Razuvious\\`:

| Sound ID | File name recorded by the addon |
| --- | --- |
| 8852 / 8853 / 8854 | `RAZ_NAXX_AGGRO01.wav` / `RAZ_NAXX_AGGRO02.wav` / `RAZ_NAXX_AGGRO03.wav` |
| 8855 / 8856 / 8858 / 8859 | `RAZ_NAXX_CMMND01.wav` / `RAZ_NAXX_CMMND02.wav` / `RAZ_NAXX_CMMND03.wav` / `RAZ_NAXX_CMMND04.wav` |
| 8860 | `RAZ_NAXX_DEATH.wav` |
| 8862 | `RAZ_NAXX_SLAY01.wav` |

The IDs are cross-referenced from the Vanilla database, not supplied by BossTalk. The filename groups describe client assets; they do not prove which server events play them. No Blizzard client archive was independently extracted in this audit.

The first-hand [DataDood Classic priest recording, Razorgore EU, December 4, 2020](https://www.youtube.com/watch?v=yXTDMgPLcfc) visibly shows the warmed-up line at [0:02](https://www.youtube.com/watch?v=yXTDMgPLcfc&t=2s). It starts with combat already underway. Exact Taunt-to-yell timing and audio playback were not independently established, so this clip does not resolve the implementation conflict or prove an every-Taunt rule.

For a CMaNGOS-based approximation, the reviewable changes would be to move mercy from handoff Begin into the engagement pool, add disappointment to the Taunt pool, and remove its generic nonfatal-failure hook. Keep the requested fatal-failure death line. Those are source-based trainer decisions, not a claim of complete Blizzard Classic Era fidelity.
