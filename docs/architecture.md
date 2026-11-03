# Game architecture

Talus owns particles, rigid bodies, joints, animation, character controllers,
streaming, collision, native weapon planning, terrain tools and persistence.
The game controls who can act, when actions resolve, which native operations
run, and what the menus display.

`world/Scripts/main.ts` creates the game only in a playable instance.
`Scripts/lib/game.ts` constructs every service before registering events. Native
libraries use `import service = require('service')` and `export = create`.
`context.ts` describes shared state and the service boundaries. Libraries are
loaded by Talus once per script sandbox and do not start as independent scripts.

| Library | Responsibility |
| --- | --- |
| `lifecycle`, `menus` | Read configuration, create the roster, restore a match, publish UI state and route player input |
| `turns`, `session` | Advance turns, resolve results, persist match state and hold save barriers during unfinished actions |
| `combat`, `chaos` | Spend ammunition on accepted launches, handle projectile payloads and run delayed death effects |
| `payloads` | Admit special weapons and route one landed carrier into its configured payload service |
| `ordnance` | Own persistent mines, finite barrages, countdowns and material payload receipts |
| `creatures`, `tricksters` | Drive native battlefield creatures, real contact effects and receipted cash transfers |
| `aiming`, `cpu` | Survey terrain, choose tactics, move, learn from impacts and retain successful shots |
| `equipment`, `economy` | Drive native controllers, reconcile finite utility consumption, purchase stock and award cash |
| `attachments` | Reserve native cast accessories, reconcile accepted-launch spending and survey fixed-angle shots |
| `special-weapons` | Bound cutting-shot aim estimates by native range, material eligibility and the protected foundation |
| `presentation`, `camera` | Smooth tracking, 1.5-second dialogue, arcade cards and native text labels |
| `residency`, `supplies` | Restore parked tanks, own bounded emitter regions, focus and award supply drops |
| `simulation` | Pin the complete battlefield, await native readiness and report memory pressure or emission shortfalls |
| `generation` | Configure native WFC/maze terrain and find supported deployment positions |
| `core` | Shared predicates, clamping and deterministic seed hashing |

## Turn sequence

Deployment waits for the pinned battlefield, finds supported open ground and creates the roster's native entity
templates. A CPU-only opening armory buys automatically. Human players can shop
before beginning. A turn centers the camera smoothly on its tank, prepares its
posture and enables only that tank's controller or CPU graph.

Firing queues a presentation: camera arrival, dialogue for 1.5 seconds, then
an accepted native cast. The cast ends the tank's input period. Projectile
launch, collision, hit and end events drive children, damage rewards and impact
feedback. Resolution uses a bounded settling interval; powders need not become
perfectly still. The score card precedes the next player card and turn.
Turn cards last 0.75 seconds; the CPU's extra shot-choice pause is 0.2 seconds.
Impacts wait 20–60 simulation ticks. Death close-ups follow the effect through
its final blast and remaining shells, then linger for one second. Final blasts
use native world-scope explosions so stored targets remain eligible; a refused
optional finale is logged without stopping the match. Residual particles keep
simulating after the close-up ends.

Camera zoom uses canvas pixels per world pixel: 1 (100%) between turns and
2 (200%) before speech. At a 1600-pixel-wide canvas these show 1600 and 800
world pixels respectively.
During flight, live shell velocity widens the view toward the apex, then descent
closes it toward the expected landing height. Short resident-terrain rays
anticipate nearer walls. Zoom changes at frame cadence, stays within 100–200%,
and pauses with the simulation or a shell held for streaming. These observations
guide presentation only; native physics determines the actual impact.

Death has its own camera/dialogue/effect sequence. Death emitters can continue
while another tank acts. In-ring effects share the battlefield's existing
simulation coverage without claiming duplicate anchors. The shooter and other
tanks remain simulated when the camera follows a distant projectile. Durable
entity IDs, native residency and actual projectile events remain authoritative.
At the camera's confined edges, arrival means reaching the closest legal view
of a ready subject; it does not require centering beyond the arena.

Special carriers declare `behavior.mode` in `Game/shop.json`; `payloads` loads
their definitions from `Game/ordnance.json`, `Game/creatures.json` and
`Game/tricksters.json`. Capacity and capability checks run before casting. Only
an accepted root landing queues the payload; expiration, removal and world-edge
termination do not summon an effect. Secondary ordnance launches are isolated
from the current attack's ammunition transaction, even if a mine's owner is
taking another turn. Real native hit/contact events drive damage and rewards.

CPU-only series buy stock and start the next round automatically after results
and outstanding effects finish. The native `game.newGame` transition receives
the roster, series and complete terrain settings. Purchases and the request are
persisted before navigation; a refused transition opens the armory with an
explicit retry. Human rounds keep the armory decision, and a completed series
stays on its results.

## State ownership

- `talus.state['indigo.match']`: the current instance's roster, turn, selected
  terrain source, CPU observations and pending work.
- Installed state: named wallets, stock, score/series records, preferences and
  shuffled dialogue decks, shared across plays.
- NPC blackboards: the current controller/graph inputs, target, angle, power,
  persona, aiming result and bounded CPU memory.
- `talus.ui`: derived menu/HUD values. HTML binds reactively through native
  `data-talus-*` attributes; buttons emit `menu.<slot>.<action>` events.
- Ephemeral handles: camera intent, native region leases, card promises and
  animation timing. These are rebuilt after loading, never serialized as handles.

Payout receipts prevent a result from paying twice. Utility consumption and its
stock debit share one installed-state write. Save barriers cover deployment,
volleys, presentations and unfinished effects. The pause menu offers an optional finish-and-save path at a safe boundary.
Quit stays available immediately and may discard unsaved battle progress.

The match stores payload records under `ordnance`, `creatures` and `tricksters`:
durable entity/body IDs, original shooter IDs, deterministic random state,
finite timers and contact cooldowns. Native entities and bodies own their
physical pose, contacts and streaming. Services rebuild region leases as needed;
they do not serialize live handles. Unfinished spawns, terrain work, countdowns
and tracked ordnance flights hold the save boundary. Dormant mines and idle
creatures remain ordinary saved world objects. Round completion waits for finite
effects, then removes owned hazards and releases their regions. Fault cleanup
invalidates pending callbacks so late completions cannot attach to another match.

## Graph and dialogue

`world/Graphs/cpu-turn.json` uses blackboard decisions to aim and fire through
native graph nodes and named game events. Scripts own strategy and sequencing;
the graph owns its native action chain. `world/Dialogue/*.ink` supplies the
announcer stories. Persona shouts are data in `Game/persona-voices.json`, with
arbitrary shout type IDs configured by `Game/personas.json`.
