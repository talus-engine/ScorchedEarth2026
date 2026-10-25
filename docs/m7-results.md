# M7 — tank dialogue and damage UI

**Dialogue is implemented and installed. Damage-number animation remains blocked on engine E10.** The current template and the existing Tony/Copper ready game contain the final stationary speech UI. No engine code was changed, and no E2E profile was copied. M6's four enabled death effects and its outstanding E14–E16 work remain unchanged.

## Dialogue

The catalog contains **1,000 unique lines: 500 shooting and 500 death**. There are 975 normally capitalized lines and 25 all-caps outbursts, including the user's “FROM HELL'S HEART I STAB AT THEE!” All other lines were newly authored; no fortune database or proprietary Scorched Earth dialogue was imported. Topics include theatrical threats, questionable ballistics, deliveries, cooking, office bureaucracy, stagecraft, computing, tank maintenance, landscaping and cosmic bad luck.

Editable sources: `assets/quips/shooting.txt` and `assets/quips/death.txt`. Run `python3 tools/build_quips.py` to validate and package `world/Game/quips.json`. Keep existing line order when retaining IDs; IDs derive from category and line number. The game uses independent seeded shuffle bags, exhausts each category before repeating it, avoids a repeat across bag boundaries, and persists the remaining bags in `indigo.quips`. Dialogue does not advance the combat RNG. The NPC blackboard records `custom.lastQuip`, and the bounded event log records selected text and ID.

A real primary projectile launch produces one firing line. Elimination produces one last word, replacing that tank's current line before its wreck can disappear. Secondary chaos shells do not each speak. Up to six bubbles coexist; last words take priority under crowding. The phrases do not interrupt turns or the Ink announcer.

**Per Tony's readability correction, bubbles stay at their initial screen position throughout their lifetime.** Neither the tank nor the projectile camera drags them around. The name identifies the speaker after it moves. Firing lines last 4.5 presentation seconds, last words 5.5, with a final 0.6-second fade. They expire while simulation is paused and are cleared on reload. They are transient UI, not saved dialogue. Normal-size screen text stays legible at 25% zoom.

## Verification

The final [installed-build replay](evidence/m7-dialogue-fixed.json) passes **11 checks** on Talus 0.0.2497. Two CPUs finish naturally on turn 3. Three primary shots produce exactly three shooting lines; one eliminated tank produces one last word despite its ten secondary fireworks shells. Speech expires during pause and after combat. Completed-match saving/reopening preserves the phrase deck and scores without resurrecting bubbles.

The deliberate camera move changes viewport origin by `(100, -100)` world pixels while the displayed sentence's left/top remain exactly equal. Compare [before](evidence/m7-dialogue-fixed-m7-shooting.jpg) and [after](evidence/m7-dialogue-fixed-m7-shooting-camera-moved.jpg). The [death screenshot](evidence/m7-dialogue-fixed-m7-death.jpg) shows the victim's last words alongside the attacker's firing line.

`node tools/check_m7.cjs` passes corpus uniqueness/case, complete-deck nonrepetition, saved selection, seed independence, event deduplication, secondary-shot isolation, stationary positioning, corpse-independent expiry, paused presentation and bounded crowding. The existing M6 policy and M5 deployment/movement-boundary checks pass. Strict TypeScript checking passes with the installed API declarations.

The [initial moving-bubble replay](evidence/m7-dialogue.json) is retained as superseded evidence. Its combat and expiry checks passed, but its save-key focus assertion failed before reopening. The final stationary replay focuses the battlefield explicitly and verifies a focused save followed by actual reopening; it does not count the first run as a persistence pass.

The [ready-game verification](evidence/m7-preview-ready.json) preserves original world `6b416563-7443-48ef-ae75-cc34ef246416`, both stable tank IDs, Tony/Copper names, preferences and scores. It is ready, unpaused and at 25% zoom. [Ready screenshot](evidence/m7-preview-ready.jpg). The [final restored-state check](evidence/m7-final-restored.json) repeats these assertions after the supplementary E10 probe and confirms the stationary source is installed. No test names or scores were left in the user's installed settings.

## Remaining engine work

The 900 ms explicit damage-text probe remains visible after **1.517 simulation seconds and 3.041 host seconds** in the final match replay. Its immediate birth screenshot preceded delivery to the page; a separate [visible-birth probe](evidence/m7-e10-visible.json) records a displayed initial label at age 0.133 seconds, a midpoint at 0.417 and the label still present at **1.933 simulation seconds / 3.880 host seconds**. Compare [visible](evidence/m7-e10-visible-visible.jpg) and [expired](evidence/m7-e10-visible-expired.jpg). The normal match also visibly accumulates numeric damage and chaos-effect labels while the new speech bubbles expire correctly.

The first supplementary probe attempted to read match state before asynchronous world loading finished; it produced no samples. The driver now waits for loaded match/UI state before emitting the probe. A subsequent complete run captured all three samples, and the final user-session restoration was independently checked. This harness readiness correction is not an additional game or engine defect finding.

The confirmed source split remains: page `ui.floatText` creates the displayed `DamageFloaters` entry; only the simulation realm calls its `tick`. The [M7 engine patch prompt](engine-m7-patch-prompt.md) specifies the generic fix and release acceptance. It also requires auditing native damage and removing any redundant game-generated numeric label only after the engine reliably presents native damage. No replacement damage animation was scripted to hide E10.

M7 therefore does **not** claim the requested floating damage repair is complete. After the engine release, rerun the physical damage probe and inspect visible rise, fade and expiry before closing it.
