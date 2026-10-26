# Export and publishing

Save the project in Talus. Native **File → Publish Game** uses
`world/Game/publishing.json` for the title, application ID, icon and targets.
The example defaults to unsigned macOS ARM64 output. A website is also a native
publish target; select the target and deployment base path in the publishing UI.

The bundled CLI can export and publish without opening a renderer. Close Talus
first so the profile is coherent, then run:

```sh
python3 tools/project.py export
```

This produces `project/scorched-earth-2026.talus`, the complete importable project.
Use `--overwrite` to deliberately replace an existing export. `--binary`,
`--publisher` and `--profile` support other installation locations.

For a publish-ready snapshot and installer:

```sh
python3 tools/project.py export --publish-snapshot --output dist/source.talus
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
outside the repository. Commit authored source and the complete template archive;
do not commit local bridge credentials or installed player accounts.
