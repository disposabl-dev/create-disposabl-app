"""Small offline checks for the selected-auth archive boundary."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from selected_auth import verify_selected_auth


class SelectedAuthTest(unittest.TestCase):
    def fixture(self):
        root = Path(tempfile.mkdtemp(prefix='disposabl-auth-selection-', dir='/tmp'))
        (root / 'vendor').mkdir()
        archive = root / 'vendor/auth.tgz'
        installed = root / 'installed'
        installed.mkdir()
        contents = {'package.json': b'{"name":"@convex-dev/auth","version":"fixture"}',
                    'dist/index.js': b'export const fixture = true;\n'}
        with tarfile.open(archive, 'w:gz') as bundle:
            for name, value in contents.items():
                info = tarfile.TarInfo('package/' + name)
                info.size = len(value)
                bundle.addfile(info, io.BytesIO(value))
                file = installed / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(value)
        (root / 'package.json').write_text(json.dumps({'catalog': {'@convex-dev/auth': 'file:vendor/auth.tgz'}}))
        return root, installed

    def test_accepts_exact_bytes_and_bun_tag(self):
        root, installed = self.fixture()
        (installed / '.bun-tag').write_text('installed marker')
        result = verify_selected_auth(root, installed)
        self.assertEqual(result['version'], 'fixture')
        self.assertEqual(result['files'], 2)

    def test_rejects_tampered_or_extra_file(self):
        root, installed = self.fixture()
        (installed / 'dist/index.js').write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'Installed auth bytes differ'):
            verify_selected_auth(root, installed)
        (installed / 'dist/index.js').write_bytes(b'export const fixture = true;\n')
        (installed / 'extra.js').write_text('extra')
        with self.assertRaisesRegex(RuntimeError, 'Installed auth bytes differ'):
            verify_selected_auth(root, installed)

    def test_rejects_nonlocal_catalog_selection(self):
        root, installed = self.fixture()
        (root / 'package.json').write_text(json.dumps({'catalog': {'@convex-dev/auth': 'latest'}}))
        with self.assertRaisesRegex(RuntimeError, 'locally selected'):
            verify_selected_auth(root, installed)


if __name__ == '__main__':
    unittest.main()
