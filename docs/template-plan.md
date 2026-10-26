# Game template design and acceptance plan

The repository is a readable, reusable Talus game example. Its source explains
the current game through named systems, configuration and native engine APIs.

## Organization

- `world/`: deployable game files: a small script entry point, native library
  modules, menus, dialogue, configuration, project presets and artist resources.
- `assets/`: editable source art and complete current native record definitions.
- `tools/`: focused commands for authoring, synchronization, installation,
  verification and publishing; explicit project/engine configuration.
- `tests/`: reusable fixtures and behavior checks named for the systems they test.
- `docs/`: game architecture, authoring, terrain, equipment, validation and
  publishing reference. Generated output belongs outside the source tree.
- `README.md`: game rules, getting started, repository map, system relationships
  and customization entry points.

## Execution

1. Preserve recovery data outside the template and identify every active runtime
   asset, native record, configuration reference and useful behavior check.
2. Retain one implementation, source asset and focused authoring command for
   each responsibility. Keep generated output and private workspace notes
   outside the maintained source tree.
3. Split the game into native Talus library modules with explicit responsibilities
   and dependencies. Consolidate repeated logic and use names that describe
   behavior. Keep functional state restoration,
   transaction receipts and native save fences as current game behavior.
4. Consolidate authoring/install tools and tests around the current structure.
   Make paths and project/engine selection explicit; verify asset and module
   references, native API usage, type checking and representative game behavior.
5. Audit the entire maintained tree for readable structure, stale references,
   duplicate code, unexplained identifiers, irrelevant commentary, generated
   output, incomplete instructions and broken links. Fix every failure and
   rerun the audit and relevant checks until all acceptance gates pass.
6. Write the final README and an editor-only level guide from the same source
   map. Include working links to files, worlds, native assets and artist areas.
   Install through public authoring APIs, read back the guide and verify that
   it is hidden during play. Preserve existing level art and game accounts.

## Acceptance gates

- One obvious entry point and one owner for each system; no chained patch scripts.
- Native libraries load through the supported Talus module mechanism.
- Every retained tool has a documented purpose and operates on current content.
- Each file describes or implements the current game. No development diaries,
  runtime trace journals, duplicate implementations or generated evidence.
- Schema fields required by native formats remain valid; publishing metadata and
  stable resource IDs are configuration, not explanations of development history.
- All local paths and asset/module links resolve; no machine-specific credentials
  or profile paths appear in source.
- Type checks, policy tests, native aiming tests and a public-API source/readback
  check pass. A fresh game can reach the normal CPU turn sequence.
- Documentation describes actual capabilities, controls, rules and engine limits
  directly. It does not claim unavailable behavior.
- The level annotation is editor-only, legible, and linked to the same project
  guide presented by the README.
