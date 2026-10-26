# Startup and spectator flow

The setup screen now offers **Start match**, plus Back and a conditional Return
to match. The invalid Continue button has been removed. The title shows Resume
saved game and Load game only when saves exist.

CPU-only opening rounds purchase supplies automatically and enter the ordinary
camera/intro/turn sequence. Mixed matches retain the armory and select the first
human player. Explicit pause still suspends progression. Shopping receipts and
phase guards prevent duplicate purchases or starts.

Validation: `check_start_flow.cjs`, `check_m10.cjs`,
`check_m12_cpu_inventory.cjs`, `check_m12_safe_exit.cjs`, and strict TypeScript
passed. Four software-render layout captures in `evidence/start-flow` show the
new/saved title and new/return setup states without clipped controls. These are
offline layout fixtures, not native app acceptance.

Installation/package acceptance is pending a coordinated quiet window. Published
0.3.1 uses engine 2585 and does not include these changes or the later engine
startup-flash/serialization fixes. The engine agent has confirmed that unattended
next-round world creation needs a public script/graph transition route; that
contract is queued. Opening CPU games do not depend on that addition.
