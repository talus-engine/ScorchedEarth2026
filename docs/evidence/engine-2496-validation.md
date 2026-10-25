# Indigo M2: editor authority and world-scoped script reload

Validated on 2026-10-22, starting from `aef4c32cf572145966ad7610e175958861c6c88b`.
This change fixes the engine contracts blocking M2 authoring. Turn rules,
AI, Ink and scoring remain later Indigo work.

## Reproduction and changes

A separate copy of the actual Indigo profile reproduced both reported
failures on installed 0.0.2495. In save
`95db4a54-184a-4cfd-9156-89d0cc25a717`, game context reported game mode but
`talus.editor.available` returned true. Writing unchanged source to the
Indigo template reduced the active game's six handlers to zero and cleared
its UI, without changing its roster.

**Editor authority** now comes from WorldManager's loaded session and
its authoring gate. Games, previews, unloaded and disposed sessions have
no script editor authority. A loaded editor template has authority before
its controller finishes construction, so top-level guards see the right
mode throughout boot. Controller-based operations also require an editor
controller for the current world. Protected native verbs recheck authority
at dispatch. Page-side authoring calls carry the world ID and runtime
clear generation and recheck them when their queued mutation starts.
Opening the editor gate does not authorize an outgoing game; cancelled
and failed transitions restore or revoke access with the session.

**Reload notifications** carry resolved OPFS paths through both bridge
channels. HTTP, the OPFS editor and the host mount share a debounce scoped
to the active script root, world ID and script generation. The page and
engine both recheck that scope before reloading. A pending edit cannot
reload a different world or a reopened instance of the same world.
Duplicate notices coalesce; engine-generated writes remain suppressed.
Declarations and compiler configuration do not trigger execution.
Per-world stores do not import the top-level global `Scripts/` tree, so
editing that tree does not reload an active world. The obsolete fallback
from invalid world IDs to global scripts was removed.

**macOS input** routes Cmd+A to Electron's native Select All command when
a text control owns focus. Canvas shortcuts retain their normal keyboard
path. Tests drive `engine_mouse`, `engine_key` and `engine_type` through
the packaged HTTP bridge, covering text inputs, numeric inputs and
multiline replacement. This uses the documented
[webContents editing command](https://www.electronjs.org/docs/latest/api/web-contents#contentsselectall).

**Activity-agent requests** use `callChat(cfg.conversation, ...)` on the
Chat Completions route. The copied configuration selects `openai` /
`gpt-6-astra`. A provider-neutral output budget now maps to
`max_completion_tokens` for OpenAI and `max_tokens` for LM Studio's
OpenAI endpoint and Anthropic. Activity merge/compression no longer force
a temperature. These choices follow the
[Chat Completions contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
and [reasoning-model parameter guidance](https://developers.openai.com/api/docs/guides/latest-model).
Six tests inspect serialized requests at the fetch boundary for the
configured model and other supported provider/model combinations. No paid
live completion was sent; absence of a console warning is not treated as
proof of server acceptance.

The menu/save timeout did not reproduce. Assigning the actual template's
menu slots and awaiting `talus.editor.save()` completed in 180 ms on the
first candidate and 170 ms on the final artifact. The
save/capture barrier is unchanged.

## Validation

Actual-project checks used the existing Indigo template and assets in a
copied profile, without reinstalling a fixture or changing its guarded
script. The fresh four-tank save is
`945a0435-74ce-422b-b726-b3ee264e35c8` in that diagnostic profile.

| Check | Result |
| --- | --- |
| Full unit suite | 1,116 files passed; 13,701 tests passed, 1 expected failure, 17 skipped; no unexpected failures |
| Additional transition coverage | Six real transition-handler cancellation/failure cases; focused rerun 35/35 passed |
| Type-check and production build | Exit 0; zero TypeScript errors; Vite and documentation build passed |
| HTTP/OPFS browser regression | Game boot, controller construction, editor-verb refusal, other-world writes, active reload exactly once, callback/timer behavior, save/reopen and editor entry passed |
| Notification regressions | World switch/reopen during debounce, title screen, global tree, duplicate bridge notices, resolved mount names and generated writes passed |
| Existing browser regressions | Plain terrain: four camera trips, no changes/wipes; WFC import: three trips, no changes/wipes; seeded title menu passed |
| Actual Indigo E6/E7 | 18 contract checks passed on the final artifact: HTTP/OPFS/host edits to the template leave the game unchanged; active edits recover six handlers and HUD without duplicating tanks; OPFS/host reload exactly once |
| Actual Indigo menus/input | Cmd+A submitted exactly 2 humans, 2 computers, 45 seconds, seed 0 and four multiline names; save/reopen retained roster and remembered setup |
| Existing M2 audit | 14/14 passed: 50×5 terrain, seams/bounds, roster, health, blackboards, restored cannon inventories and preferences |
| Packaged desktop smoke | Full suite passed on final artifact, including Apple Metal WebGPU, isolation, OPFS, HTTP tools, all three Select All probes, editor boot and exit arbitration; no uncaught page errors or crashed child processes |
| M1, per-flight audit | 23/23 lifecycle checks and six complete 192-chunk audits passed; no unexpected material or particle loss after any of four shots; exact fingerprints after reopen |
| M1, final artifact / original timing | 23/23 checks passed in a second fresh game; both full 192-chunk audits passed, with exact terrain and particle fingerprints after camera trips and save/reopen |

The first M2 harness attempts are retained in scratch. Their failures were
comparison of changing callback timing counters, interpreting an OPFS path
as an absolute mount path, and reading the outgoing session before a
same-save navigation completed. The final harness compares session,
handlers, UI and roster, resolves paths under the mount, and waits for a
new page time origin on reopen. It does not relax engine assertions.

## Artifacts and preservation

The final Apple Silicon package is 0.0.2496, built locally with ad-hoc
signing. It is not notarized or published. No Intel or Windows runtime
validation is claimed. The installed app remains 0.0.2495; replacing it is
a release coordination step with Tony.

| Artifact | SHA-256 |
| --- | --- |
| Installed 2495 `app.asar` (unchanged) | `6439f69bd6e8993032dfcab5fa992df1a164538933cff1480edbeb20f63d46f0` |
| Final 2496 `app.asar` | `b8d8df44af4be97b03851a2e38f694cd5e29a4fb95e2781f79440f79dff4a417` |
| Final arm64 ZIP | `d1bdd7abefdb095633e34beff310a3dcaf7fdbcc5abab435a9041f41e30ac6da` |
| Final arm64 DMG | `95d5ab72a1492a63d529a0415f24698fef1d6fa353819baa009731aa4633632a` |

The final artifacts are in `tools/desktop/dist`, with an identical copy
under `/private/tmp/indigo-m2-engine/artifact-final`.
The initial candidate preceded only documentation/build-number updates;
its full per-flight M1 audit is retained alongside the final candidate's
combat replay. No simulation implementation changed in this patch.

[Acceptance evidence](evidence/indigo-m2-engine-2496-acceptance.json)
records individual checks, diagnostic save IDs, hashes and source evidence.
Raw reports, logs, copied profiles and harnesses are under
`/private/tmp/indigo-m2-engine`. All 33 original Indigo M2 evidence files
still match their preserved SHA-256 hashes. Original saves and the installed
app were not used for writable diagnostics. No credentials were copied into
the repository, no game guard was removed, and no terrain was repaired or
kept permanently resident.
