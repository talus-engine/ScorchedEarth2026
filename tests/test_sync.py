import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from talus_sync import sync, inventory


class FileSyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo, self.live, self.state = root / 'repo', root / 'live', root / 'baseline.json'
        for p in (self.repo, self.live):
            (p / 'Scripts').mkdir(parents=True)
            (p / 'Scripts/game.ts').write_text('same')

    def run_sync(self, action, **kwargs):
        return sync(action, self.repo, self.live, self.state, **kwargs)

    def test_capture_then_conflict_preserves_both_edits(self):
        self.run_sync('capture')
        (self.live / 'Scripts/game.ts').write_text('from Talus')
        self.run_sync('capture')
        self.assertEqual((self.repo / 'Scripts/game.ts').read_text(), 'from Talus')
        (self.live / 'Scripts/game.ts').write_text('engine edit')
        (self.repo / 'Scripts/game.ts').write_text('repo edit')
        with self.assertRaisesRegex(RuntimeError, 'Resolve'):
            self.run_sync('capture')
        self.assertEqual((self.repo / 'Scripts/game.ts').read_text(), 'repo edit')
        self.assertEqual((self.live / 'Scripts/game.ts').read_text(), 'engine edit')

    def test_bootstrap_conflict_is_not_a_preferred_side(self):
        (self.live / 'Scripts/game.ts').write_text('different')
        with self.assertRaisesRegex(RuntimeError, 'Resolve'):
            self.run_sync('capture')
        self.assertFalse(self.state.exists())

    def test_missing_file_never_deletes_other_side(self):
        self.run_sync('capture')
        (self.live / 'Scripts/game.ts').unlink()
        (self.live / 'Scripts/other.ts').write_text('still mounted')
        with self.assertRaisesRegex(RuntimeError, 'Resolve'):
            self.run_sync('capture')
        self.assertTrue((self.repo / 'Scripts/game.ts').exists())
        self.assertFalse((self.repo / 'Scripts/other.ts').exists(), 'Preflight happens before any writes')

    def test_binary_capture_and_generated_exclusions(self):
        (self.live / 'Art').mkdir()
        (self.live / 'Art/title.png').write_bytes(bytes(range(256)))
        (self.live / 'Scripts/game.js').write_text('compiled')
        (self.live / 'Scripts/talus.d.ts').write_text('generated')
        self.run_sync('capture')
        self.assertEqual((self.repo / 'Art/title.png').read_bytes(), bytes(range(256)))
        self.assertFalse((self.repo / 'Scripts/game.js').exists())
        self.assertFalse((self.repo / 'Scripts/talus.d.ts').exists())

    def test_install_only_repo_changes(self):
        self.run_sync('capture')
        (self.repo / 'Scripts/game.ts').write_text('reviewed edit')
        writes = []
        def writer(name, text):
            writes.append(name)
            (self.live / name).write_text(text)
        self.run_sync('install', writer=writer)
        self.assertEqual(writes, ['Scripts/game.ts'])
        self.assertTrue(all(r['state'] == 'same' for r in self.run_sync('status')))

    def test_offline_or_symlink_refuses(self):
        with self.assertRaisesRegex(RuntimeError, 'unavailable'):
            inventory(self.live / 'absent')
        (self.live / 'Scripts/link.ts').symlink_to(self.repo / 'Scripts/game.ts')
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            self.run_sync('capture')


if __name__ == '__main__':
    unittest.main()
