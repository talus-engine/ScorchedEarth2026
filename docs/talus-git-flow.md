# Talus files and Git

Use real files under `world/`, not a symlink to the mount. Git stores a symlink's target path, not the mounted tree behind it. A convenience link may help browsing, but is not a project backup.

The Talus mount is an NFS view of the app's OPFS file tree. It may disappear while Talus/its bridge is stopped. Folder names follow world names and can change after renaming. `tools/talus_sync.py` resolves the current path through the HTTP context and requires the **Indigo template editor**, never a running match/save. An offline/empty mount refuses instead of looking like deleted content.

## Daily flow

Open Indigo in the Talus editor and finish any active edits, then:

```sh
python3 tools/talus_sync.py status
python3 tools/talus_sync.py capture
git diff -- world
git status --short
```

Capture copies live edits and new files into `world/`, including binary art/audio. It preserves local changes. Both sides changing the same file, an initial differing file, or a missing previously captured file stops the operation before any writes. Resolve those differences deliberately; select independent files with repeated `--path Game/example.json` arguments. There is no force or automatic-delete mode.

After editing/reviewing repo files:

```sh
python3 tools/talus_sync.py status
python3 tools/talus_sync.py install --path Scripts/match.ts --path Menus/shop.html
```

Install writes reviewed text through the public authoring API, reads it back exactly, saves the template and checks script faults. It refuses files changed independently in Talus. Binary/large assets can be captured, but this installer deliberately requires the existing `talus.files.writeBytes` asset workflow for them. It does not silently skip a selected changed binary. Multi-file installation is not an engine transaction; the next status/readback identifies any partial completion after failure.

Review and stage desired changes with normal Git commands. No commit is created automatically. Initially this repository's authored files are untracked, so use `git status` and inspect new files as well as `git diff`; diff alone omits untracked files.

## What is captured

Authored source/configuration and image/audio files are included. Auto thumbnails, generated declarations/tsconfig, compiled JS when adjacent TS exists, example scripts and dotfiles are excluded. Scripts, menus and data remain ordinary Git files. Consider Git LFS for large source art or exported archives if they become substantial.

The private sync baseline is `artifacts/talus-sync/baseline.json` (already ignored). It stores the last identical hashes and the template ID, with no bridge token. It is machine-local conflict evidence, not game content. First capture can establish identical files while other paths remain unresolved. Do not delete the baseline merely to override a conflict.

The mount does **not** export the database. Entity templates, factions and other database-authored resources are not made into a complete game backup by copying these files. Keep public-API resource exports/authoring sources and periodic `.talus` project exports as the complete-project checkpoint. The future in-app publisher remains a separate engine feature.

## Verified here

Six local tests cover two-sided edits, bootstrap conflicts, missing/offline files, binary capture, generated exclusions, text installation and symlink refusal. Live comparison resolved the real Indigo mount and initially established a baseline for 21 identical authored files; the final capture verified 35 identical authored files (including WFC policy and complete preset snapshots), with four repo-only art/Ink sources preserved. New API-created files briefly hit the NFS metadata cache; capture correctly refused the missing-side state and succeeded once the mount exposed them. Retry after the mount catches up; never clear the baseline or force a deletion to get past this check. Initial differing files were preserved. After review, the installed generation files matched their repo copies, and the disabled historical `Scripts/m1.ts` placeholder was replaced with its actual mounted tank ID. This is not a claim that the database or a complete `.talus` export has been captured.
