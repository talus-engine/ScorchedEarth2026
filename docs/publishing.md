# Export and publishing

Save the project in Talus. Native **File → Publish Game** uses
`world/Game/publishing.json` for the title, application ID, icon and targets.
The example defaults to unsigned macOS ARM64 output. A website is also a native
publish target; select the target and deployment base path in the publishing UI.

The bundled CLI can export and publish without opening a renderer. Close Talus
first so the profile is coherent, then run:

```sh
node tools/project.cjs export
```

This produces `project/scorched-earth-2026.talus`, the complete importable project.
Use `--overwrite` to deliberately replace an existing export. `--binary`,
`--publisher` and `--profile` support other installation locations.

For a publish-ready snapshot and installer:

```sh
node tools/project.cjs export --publish-snapshot --output dist/source.talus
mkdir -p dist/packages
ELECTRON_RUN_AS_NODE=1 /Applications/Talus.app/Contents/MacOS/Talus \
  /Applications/Talus.app/Contents/Resources/publisher/tools/publish/cli.mjs \
  --in dist/source.talus --out dist/packages \
  --runtime /Applications/Talus.app/Contents/Resources/publisher/runtime \
  --toolchain /Applications/Talus.app/Contents/Resources/publisher/release.json
```

The publishing engine must match the build that wrote the snapshot. Open and
close the installed build once before exporting a profile whose provenance is
missing. Do not edit build stamps. The CLI also accepts a complete native
SQLite backup with `--database`; a raw database file may omit external terrain
and project files and is not equivalent to a complete backup.

Keep installers, extracted profiles and working output in ignored `dist/` or
outside the repository. `project/*.talus` is also ignored: commit authored source
on `main`, and publish archives only on the artifact branch. Never commit local
bridge credentials or installed player accounts.

## Remote template revisions

Talus downloads this template from its public repository's `templates` branch.
The repository must stay public: builds read raw files anonymously over HTTPS,
with `Access-Control-Allow-Origin: *`. Use plain Git over SSH for repository
operations. No release uploads, hosting credentials or GitHub API are needed.

The engine registry pins content-addressed parts by size and SHA-256. Keep every
published revision folder and its bytes forever; older engine builds depend on
them. Only `<id>/latest.json` and `<id>/registry.json` advance. Never force-push,
rewrite the artifacts branch, overwrite a revision or delete an older folder.

The archive schema must match the engine that pins it. Compare the installed
desktop build with the checkout's `build_number.txt`; stop if they differ.
Re-export and republish whenever the engine schema changes. Do not change
archive tables or build stamps to make an incompatible export import.

Save the configured root world with the title **Scorched Earth 2026**, the
**Template** checkbox enabled, a short description and a thumbnail. Save and
close Talus before exporting. The helper defaults to the sibling `foxtrot`
checkout, the sibling `<source-directory>-artifacts` worktree on `templates`,
and the normal Talus desktop profile. Override these paths as needed:

```sh
export TALUS_ENGINE_ROOT=/path/to/talus-checkout
npm run template:export
npm run template:publish -- --artifacts /path/to/artifact-worktree
# For a separate authoring profile, add --profile /path/to/profile.
```

`template:export` verifies matching builds (2766 or later), exports the archive
at `project.json`'s `archive` path, runs the complete audit and runs `npm test`.
`template:publish` performs that export, then uses the engine's registry tool to
stage a new revision, verify its local files, commit just its revision and
pointers, and push `origin templates`. It polls hosted verification for up to
five minutes and prints the engine registry diff. It never stages, commits or
pushes the engine checkout. `--version YYYY-MM-DD` sets the revision label;
otherwise it uses today's UTC date.

The artifact worktree must be clean, use the SSH remote in `project.json`, and
track the `templates` branch. The helper fetches that branch and only accepts a
fast-forward merge. If a run stops after staging or committing, inspect those
changes and finish their commit/push/verification manually before rerunning.
Keep the existing revision intact.

After hosted verification reports `ok`, run this from the engine checkout:

```sh
TEMPLATE_REGISTRY_LIVE=1 npx playwright test tests/e2e/remote-templates.spec.ts -g "build registry"
npm run type-check
git add src/templates/templateRegistry.json
git commit
```

The live lane must download and import the revision through Featured Templates.
Keep engine source unchanged while it runs. Commit only the registry; the
engine's commit hook adds its own build metadata. Do not publish the engine
repository without a separate decision to do so. The next built registry
offers the revision; existing builds retain their pinned artifacts.

For manual import, read the
[latest revision manifest](https://raw.githubusercontent.com/talus-engine/ScorchedEarth2026/templates/scorched-earth-2026/latest.json).
Resolve each `parts[].path` against its `baseUrl`, download in listed order and
concatenate the bytes into one `.talus` file. A one-part revision is already an
importable archive. Verify the listed sizes and SHA-256 hashes before importing.

## Player permissions

`world/Game/publishing.json` explicitly enables gamepads and fullscreen, which
do not prompt, and disables MIDI, microphone, camera, local network and clipboard
reading. The game asks players for no browser permissions. Projects copied from
the template inherit this choice; **File → Publish Game → Permissions** edits
the same settings. Keep the file and the exported template synchronized.
