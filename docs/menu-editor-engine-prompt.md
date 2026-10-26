# Engine request: Menu Editor and Simulator

Status: ready for ENGINE implementation, 2026-10-26. This is an explicit user
feature request, independent of the current serialization/publishing work.
Coordinate release numbering in `AGENT_CHAT.md`; do not interrupt a running game
for acceptance. This document proposes contracts; none of the new APIs below
are claimed to exist yet.

## Outcome

Add a large **Menu Editor** tool, presented like World Layout, with a resizable
50/50 split: existing code editor on the left, faithful interactive menu preview
on the right. Authors should change HTML/CSS, manipulate fake game state, fire
fake events, and immediately see the result without starting a game. Preview
state, events, controllers, settings, blackboards, scripts and scene simulation
must be private to the preview session. No fake event may reach the engine,
active world, another preview, account store, or installed game.

Use Vue reactivity for the preview model and simulator controls. Keep authored
HTML's existing markup/CSS/binding format; this is not a new Vue-template format
and does not require migrating existing games.

## Concrete game cases

Scorched Earth 2026's `indigo/world/Menus` provides acceptance examples:

| Surface | Required states/features |
| --- | --- |
| `title.html` | No saves / saved games; submenu navigation; full-screen `talus-scene-view` behind buttons; title child world and current project assets |
| `setup.html` | CPU-only / mixed roster, long names, number/select/text inputs, seed, expandable advanced controls, actual `talus-terrain-settings`, typed launch params |
| `shop.html` | Repeated weapon cards, cash, stock, disabled purchases, selected player, opening / between-rounds states, next seed |
| `hud.html` | Top/bottom bars, human / CPU controls, 2–16 tanks, equipment drawer, results/standings, money popups, animated one-second tread cards |
| `pause.html` | Ordinary pause, save-blocked action, exit draining, error/status changes |
| `controls.html`, `credits.html` | Navigation, overflow and long text |
| `loading.html` + `loading.json` | Loading phases/progress, custom/default/hidden policy and error states using the dedicated loading renderer |
| Native settings/load/dialogs | Game theme, tabs, controller bindings, focused rightmost binding button, validation dialogs and return focus |

The native bindings page repeatedly clipped the action label when the rightmost
button was focused. The preview must reproduce focus scrolling and real native
component widths, not replace these controls with a screenshot or simplified
HTML. Our current `tools/capture_start_flow.mjs` and
`tools/capture_gameplay_polish.mjs` are useful fixture data, but their copied
binding logic/placeholders are **not** a renderer to reuse.

## Existing engine code examined

Paths below are relative to the engine repository (`foxtrot`):

- `src/components/WorldLayoutWindow.vue`, `WorldLayoutEditor.vue`,
  `panel/WorldPanelTeleports.vue`, `popout/PopoutToolMounts.vue`: large tool/window
  conventions, persistence, popout integration.
- `src/components/IdeCodePane.vue`: reusable CodeMirror 6 pane. `langFor()`
  currently has JS/TS/JSON/Markdown/Rust but **no HTML or CSS support**. Add these
  through shared editor language support, not a second editor.
- `src/state/opfsIdeState.ts`, `src/components/OpfsIdeWindows.vue`: shared buffers,
  dirty state, external-change detection, save/reload/overwrite and close guards.
  Reuse the same buffer when a file is open in both tools.
- `src/menus/menuDocs.ts`: slot config, project file reads, HTML sanitizer,
  seeded defaults. Scripts, inline event handlers and executable URLs remain
  prohibited. Preview exactly what survives this sanitizer; report removals.
- `src/components/MenuOverlay.vue`: real markup render, native piece mounting,
  terrain draft/typed params, action dispatch, navigation, title model and scene
  readiness. Currently coupled to global overlay, DB, facade and pause state.
- `src/components/HudOverlay.vue`: HUD bindings/click-through behavior and
  separate rendering path. Preserve its distinct capabilities/layer ordering.
- `src/menus/menuBindings.ts`: real repeat/show/text/value/style/class/attribute
  bindings and typed value collection. Reuse this implementation.
- `src/menus/menuPieces.ts`, `MenuVerbPanel.vue`, `PlayerLobbyPiece.vue`,
  `TerrainMenuControl.ts`: native widgets/composites and special terrain control.
- `src/menus/MenuNavigation.ts`, `menuInput.ts`, `menuNavigationConfig.ts`:
  navigation machinery. `menuInput` currently finds roots on the global
  document and installs global listeners; preview needs scoped ownership.
- `src/menus/gameMenuTheme.ts` + CSS: theme currently mutates `document.body`
  and navigation/loading singletons. Preview cannot call that global path.
- `src/components/SettingsDialog.vue`, `ControlsSettingsPanel.vue`: real
  settings tabs/rebinding; currently capable of modifying actual input state.
- `src/menus/scenes/TalusSceneView.vue`, `MenuSceneClient.ts`, `MenuSceneHost.ts`,
  `MenuSceneDocument.ts`: actual scene canvas attach/resize/readiness/teardown.
  Previewing the burning title must not burn or reset the authored child world.
- `src/components/loading/AuthoredLoading.vue`, `gameLoadingPresentation.ts`,
  `public/loading-presentation.mjs`: loading has its own isolated document and
  binding contract. Keep that parity instead of treating it as a normal menu.

## Architecture and UI

1. **Shared rendering session, explicit dependencies.** Extract the reusable
   document lifecycle (sanitize, mount, bind, collect, navigate, unmount) from
   runtime overlays. Inject a context for project files, model, actions, native
   pieces, theme, input and scene host. Production and preview use the same
   renderer, with runtime versus simulator adapters. Do not make the simulator
   use the global `menuOverlayState`, script dispatcher, input manager or DB
   mutation methods. Mounting native pieces must also use these adapters.

2. **Large tool, files first.** Add Menus entry under editor tools/Game panel;
   Preview/Edit shortcuts beside slot assignments and from HTML files in the
   existing file browser/IDE. Open arbitrary project menu files, assigned slots,
   theme/navigation/loading configs and preview fixtures. Default 50/50 split,
   draggable divider, maximize/code-only/preview-only, familiar window registry
   and popout behavior. Save explicit; editing previews an unsaved buffer after
   a short debounce. Preserve cursor, undo, dirty/conflict and discard semantics.
   Shared HTML/CSS syntax support and snippets for documented Talus tags and
   bindings; existing JSON editor for theme/model/scenarios.

3. **A real virtual viewport.** Right side offers width/height, presets including
   960×540, 1280×720, 1440×868, 1920×1080 and portrait, 100%/fit scale, backdrop,
   device scale where supported and screenshots. A 1440px preview fitted into a
   650px pane must still evaluate media queries/vw/fixed positioning as 1440px.
   Use an owned preview document/iframe with the trusted renderer and actual
   engine fonts/styles/providers. Do not scale an ordinary editor div and call
   it a separate viewport. Keep author CSS, native teleports/dialogs, tooltips,
   focus scrolling and theme confined to that document. Audit cross-document
   `instanceof`, ownerDocument, activeElement and global document/window calls;
   run renderer/bindings in their owning realm or make them document-aware.

4. **Reactive simulation state.** Each session owns a Vue reactive store with
   UI model, fake installed/title state, fake entities/blackboards, roster,
   settings/input drafts, loading progress and a simulation clock. Changes flow
   through the actual binding/render path (coalesced updates, preserving focused
   input drafts and unchanged repeated rows). Provide a JSON editor, convenient
   scalar/array controls and binding-path inspector with missing-path notices.
   Capture live UI/blackboard data only by an explicit read-only snapshot action,
   clone it into the session, and never install the result back into gameplay.

5. **Fake events and blackboards, strictly session-local.** Provide an event
   composer (name, target fake entity, JSON payload), history, saved scenarios,
   single step and timeline playback. Example events: damage, cash earned,
   turn changed, match finished, inventory changed, save barrier changed, menu
   action and loading progress. A fake blackboard inspector supports editing
   typed fields and firing its change event. Each preview gets its own bus and
   listener registry, destroyed on close; zero forwarding to production topics,
   scriptsDispatch, world entities, other previews or native game events.

   Existing HTML is declarative; arbitrary engine events do not automatically
   become UI state. Make this visible: event → fixture reaction → UI model/
   fake blackboard changes → real binding render. Support declarative scenario
   reactions (set/merge model, change fake BB field, navigate preview route),
   with exact typed payloads and an event/state-diff log. For authors needing
   real event-handler logic, support an opt-in preview driver in a separate
   script sandbox bound only to fake entity/BB reads, the private bus and UI
   model writes. No implicit production script startup, DB/network/world/native
   authority, real facade access or fallback to live services. Unsupported
   operations fail visibly in the simulator. A driver and its timers/listeners
   must stop on reset/close; errors stay in the preview. Use existing script VM
   machinery with a deliberately restricted context, not eval in menu HTML.

6. **Real navigation, simulated consequences.** Mouse, Tab, LRUD, confirm/back,
   input capture/rebind and optional connected gamepad use shared navigation.
   A Test input toggle clearly gives the preview focus; typing code must never
   move the preview selection. Release ownership on blur/close, not Escape
   alone (Escape itself is a menu action). Preview-local show-menu/back routes
   preserve drafts and focus. New game/continue/load/quit, shop purchases and
   custom actions log their collected typed payloads and run fixture reactions,
   never their production side effects. Settings/native dialogs render actual
   components with fake services; rebinding cannot alter the user's bindings.
   Unknown actions are reported as unhandled, not silently treated as success.

7. **Scenes and animation.** Support HUD-over-backdrop plus modal menus, the
   actual title scene, and dedicated loading previews. Scene playback must use
   a disposable preview-owned simulation/session loaded from project source;
   no persisted child-world resets/writes or advancing the active game's scene.
   Reuse native scene lifecycle and bounded resources, one active scene session
   per preview; offer pause/restart, clearly show loading/error/unsupported
   status and release GPU/resources on hide/close. If real scene preview cannot
   be provided in a context, show an explicit placeholder/status. Never claim
   that proves visual parity. Provide CSS animation play/pause/restart/scrub for
   tread cards and cash popups, plus a separate deterministic fixture/event
   clock; native simulation needs its own supported step/pause path.

8. **Diagnostics and durable fixtures.** Show sanitized/unknown markup,
   missing binding paths/assets, native component errors, focus target, actual
   submitted params, action/event log and model diffs. Inspect element bounds,
   clipping against all scroll/overflow ancestors, and visible focus targets;
   distinguish intentional scroll content from inaccessible clipping. Include
   click-to-code/source mapping where reliable; repeated rows identify template
   source and row index. Save versioned fixtures under project-owned
   `Menus/Previews/` (normal world files, mount/git/export/publish closure).
   Fixtures store models/fake blackboards, viewport, route, clock and events;
   no generated browser profiles, external absolute paths or real account IDs.
   Offer screenshot/export of diagnostics for review; closing drops scratch state.

## Implementation slices (one feature, staged delivery)

A. Shared renderer/session and isolated document; editor shell, shared buffers,
   HTML/CSS language support, true viewport, reactive model fixtures, sanitizer
   diagnostics. Prove runtime parity before broad simulator features.

B. Private event/blackboard store, reactions and optional restricted drivers;
   navigation/action log, native pieces/settings/terrain adapters, saved scenarios,
   animation controls and clipping/focus diagnostics. These are required for the
   usable simulator, not deferred to an unrelated visual editor project.

C. Native title-world scene preview with disposable ownership, loading/HUD/modal
   composition, public automation, screenshots and packaged acceptance. Keep the
   existing startup loading/readiness gates intact throughout the refactor.

Do not add drag-and-drop WYSIWYG layout tooling to this request. Code editing and
faithful stateful preview are the goal. Do not copy renderer/binding algorithms
into test-only implementations or build a second full game engine for HTML preview.

## Public automation and acceptance

Expose editor-session operations through the normal native tool/API/MCP catalog:
open/select project+slot/path, inspect, set unsaved source/model/fake blackboards,
fire preview event, play/step/reset scenario, set viewport, navigate input,
read diagnostics and capture screenshot, save source/fixture, close. Return a
session ID and errors; require explicit session targeting. Names may follow
engine conventions (for example `engine_menu_preview`); publish the actual
contract in AGENT_CHAT. Reuse the UI implementation; no secret DOM-only hooks.

Acceptance must include:

- Same menu + viewport + model renders equivalently in preview and runtime;
  same sanitizer, theme/fonts, native pieces, typed launch values and focus rules.
  Both editor and published player still pass their normal menu tests.
- Unsaved HTML/CSS edits update preview; editor and IDE share a buffer; dirty
  external file changes cannot be overwritten silently. Viewport media queries
  respond to the chosen virtual size, not the pane width.
- Reactive damage/cash/turn/death/blackboard events update bound text, repeated
  lists, hidden/disabled controls and animations; history shows the exact diff.
  Two preview sessions prove event/model isolation.
- Fake events, purchases, quit/new-game, settings/rebinding, scene burning and
  driver scripts cause **zero** production events, installed-state/DB writes,
  live blackboard changes, game actions, input-binding changes or child-world
  persistence. Test assertions at those real boundaries, not only fake counters.
- Controller focus on the rightmost native bindings button preserves the action
  label; capture narrow/wide sizes, long names, 16 tanks, shop rows and tabs.
  Navigate title→setup→validation dialog→back and verify input drafts/focus.
- Actual title scene renders behind controls at 100% preview size; close/reopen
  releases and reacquires resources without changing authored pixels. Loading
  tests cover custom/hidden/error and show no stock-menu flash introduced by
  the shared-renderer extraction.
- Teardown/remount, rapid edits, invalid markup/model, missing assets, driver
  errors and unsupported components remain bounded and visible. No accumulation
  of timers/listeners, orphan workers/canvases or unbounded screenshots/profiles.
- Public API/MCP roundtrip drives the same preview states and screenshot outputs.
  Document supported fidelity and any remaining limits honestly.

Return a source/contract handoff first, then test/build evidence. GAME will add
Scorched Earth fixture scenarios and run the actual menu screen review after the
feature is installed and a coordinated UI/GPU window is available.
