# Talus patch handoff: game/editor authority and world-scoped script reload

**Historical handoff, implemented and accepted in installed 0.0.2496 (`ebfcba48d`).** See [current engine work](engine-work.md), [independent reload replay](evidence/m2-2496-verified-reload.json), and [engine validation](evidence/engine-2496-validation.md). The original reproduction and requirements below remain preserved.

Continue from the validated local engine `main`, `aef4c32cf572145966ad7610e175958861c6c88b`, in `/Users/tonygermaneri/gh/foxtrot`. Read AGENTS.md. Installed `/Applications/Talus.app` is **0.0.2495**. Indigo M1 is accepted, with all 33 independent checks passing. Preserve the terrain, durable projectile ownership, and deferred-hit fixes. This handoff concerns new issues discovered while authoring M2, the full arena and custom match setup.

Game repository: `/Users/tonygermaneri/gh/indigo`. Template: `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. Use the local HTTP interface through `tools/bridge.py`; credentials remain outside the repository. Preserve existing saves and evidence. Do not remove the game's documented editor guard or add a game-specific mode detector to hide these problems.

## E6: `talus.editor.available` incorrectly becomes true in game mode

**Confirmed runtime and source defect. Blocks safe script hot reload.**

`engine_describe_context` reports `world.isEditorMode: false` and a game-save ID. In that same running game, `engine_run_script` returns `talus.editor.available === true`. The game script uses the documented top-level guard `if (!talus.editor.available) { ... }`. It runs at initial boot, but after hot reload it registers zero handlers. Its UI model is cleared, leaving an empty HUD and inactive controls without a script fault.

Evidence: `docs/evidence/m2-mode-mismatch-context.json`, `m2-mode-mismatch-script.json`, and `m2-hot-reload-status.json`. Original affected save: `b6b67417-05fe-429d-a389-881a1202988e`. The roster and terrain remain intact; this is not another terrain-loss report.

Source:

- `src/app/engine/hostScripts.ts`, `editorAvailable: () => getLiveEditorController() !== null`.
- `src/app/engine/hostSession.ts`, `hostBuildGameModeController` intentionally creates and registers `new LiveEditorController(..., 'game')`.
- `src/scripting/api/spec/editor.ts` promises game mode returns `available: false` and editor verbs throw `NO_EDITOR`.

Controller existence is therefore not sufficient evidence of editor authority. Resolve availability from authoritative session mode/authoring authority. Review editor verb enforcement and transitions for consistency; do not merely change the exposed boolean while leaving template mutation available in a game session. The reported availability and handler loss are reproduced; unauthorized mutation through individual editor verbs has **not** been tested.

Required tests: real game initial boot, post-controller construction, current-world script reload, save/reopen, editor entry/exit, and failed/cancelled transitions. In games, availability stays false and editor-only verbs refuse without mutations. In an editor session it is true and supported verbs work. A guarded game script must register handlers and rebuild its UI after reload, without duplicating entities or callbacks.

## E7: changing a different world's script reloads the active game

**Confirmed source and runtime behavior. Compounds E6 and disrupts external authoring.**

With a forked Indigo game active, write the template's `Scripts/match.ts` through `write_world_file`. The active game is a different world with its own script tree. The template write nevertheless reloads the active game's scripts and clears its UI.

Controlled reproduction on save `95db4a54-184a-4cfd-9156-89d0cc25a717`: six handlers and a populated HUD before the write; one script entry, zero handlers and an empty UI model (`{}`) afterward. The write used the **unchanged template source**, returned `worldId: d9fa0363-0172-a96e-9b10-0b0c3d9a1f58` and `reloaded: null`, yet the unrelated active game reloaded. Its roster stayed identical. Reopening the preserved game restores its initial boot path. Evidence: `docs/evidence/m2-cross-world-write-result.json`, `m2-reload-before-status.json`, `m2-reload-after-status.json`, `m2-reload-before-state.json`, `m2-reload-after-state.json`, `m2-reload-context.json`, and `m2-lifecycle.json`.

Source:

- `src/world/worldFileOps.ts` correctly checks `worldId === env.loadedWorldId` before using the direct `saveScript` reload path. Other-world writes use ordinary file persistence.
- `src/app/engine/scriptsHotReload.ts`, `isScriptTreePath`, accepts any `Worlds/<id>/Scripts/` tree. `noteScriptPathsChanged` reloads the current engine for any such path, without testing the active world ID. Both OPFS notifications and host-mount notifications feed this logic.

Scope reload notifications to the script sources actually used by the active session. Define the global `Scripts/` behavior explicitly. Maintain the existing debounce and suppression of engine-generated writes. Recheck the session when the debounce fires so an edit cannot reload a newly switched, unrelated world.

Required tests: loaded world A, edit world B through HTTP, OPFS editor, and host mount; A's script generation, handlers, timers, and UI remain unchanged. Edit A and it reloads exactly once. Cover duplicate bridge notification paths, generated artifacts/manifest writes, no engine on the title screen, and a world switch during debounce. Test through the public interfaces, not only the path predicate.

## Secondary observations to triage

1. **HTTP Cmd+A does not select input text on this macOS desktop build.** In the focused custom-menu numeric input, `engine_key {key:'a',modifiers:['meta']}` reports success but the next `engine_type` appends. A four-tank test submitted humans=12, computers=12, seconds=3045 instead of 2, 2, 45. The game correctly rejected it. End followed by Shift+Home visibly selects the number and replacement works. This is an external input-tool issue; no game logic workaround was added. Review `src/ai/orchestrator/agentInput.ts` and the Electron dispatch/default editing-command path. Add a real packaged text-field selection/replacement test, including multiline text. Submitted parameters are retained in `docs/evidence/m2-invalid-form.json`; selection screenshots are `m2-cmd-a-selection.png` and `m2-shift-home-selection.png` in that folder.
2. **Activity-agent model parameter rejection was observed during authoring.** `[EditorActivity] ticket merge failed` reported HTTP 400: `Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.` It repeated during installation. Later console capture had already rotated this warning out; `m2-agent-warning.json` is empty and is not proof of resolution. Identify the configured request route and test parameter selection against supported models. This did not block the authored terrain/setup path; do not infer a root cause beyond the server rejection.
3. **One combined editor script timed out at 120 seconds** after setting menus and awaiting `talus.editor.save()`. Menus were assigned; an isolated `await talus.editor.save()` then succeeded in 1,493 ms (`docs/evidence/m2-save-isolation.json`). This is an unresolved timing observation, not a confirmed additional blocker. Investigate if reproduced; preserve save/capture safety rather than bypassing the flush.

## Release acceptance

Fix the general engine contracts, run relevant regressions plus the required zero-error type-check and desktop/package checks, and prepare an updated release with Tony. Record the commit and installed artifact hash. No game-side chunk repair, mode hacks, or watcher suppression.

Validate against the actual Indigo template as well as isolated fixtures. Its setup now authors a 50×5 tile arena, seeded menu, durable roster, installed preferences, and tank-inspection HUD. In a fresh match, update a different world's script, confirm no active reload, then edit the active script and confirm its guard still executes and its HUD/handlers recover. The roster must remain unchanged. Save/reopen and retest the menus. Keep M1 terrain and projectile lifecycle checks passing.

M2 results and retained test saves are recorded in `docs/m2-results.md`. Turn timers, movement/aim/fire input, AI behavior graphs, Ink, OOB elimination, and scoring are later game milestones, not missing engine features established by this investigation.
