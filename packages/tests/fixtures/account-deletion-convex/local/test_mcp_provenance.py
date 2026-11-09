"""Offline provenance checks; no backend, provider or installation."""
import json
from pathlib import Path
import tempfile
import unittest
from prepare import digest, verify_mcp


class McpProvenance(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='disposabl-mcp-proof-', dir='/tmp'))
        self.patch = self.root / 'patches/mcp.patch'
        self.patch.parent.mkdir()
        self.patch.write_text('synthetic patch')
        package = {'catalog': {'@convex-dev/mcp': 'fixture'},
                   'patchedDependencies': {'@convex-dev/mcp@fixture': 'patches/mcp.patch'}}
        (self.root / 'package.json').write_text(json.dumps(package))
        self.lock = self.root / 'bun.lock'
        self.lock.write_text('  "@convex-dev/mcp": ["@convex-dev/mcp@fixture", "", {}, "sha512-fixture"],\n')
        self.hashes = {'dist/component/tokens.js': digest(b'fixture code')}
        record = {'name': '@convex-dev/mcp', 'version': 'fixture',
                  'upstreamIntegrity': 'sha512-fixture', 'patch': 'patches/mcp.patch',
                  'patchSha256': digest(self.patch.read_bytes()), 'files': self.hashes}
        path = self.root / 'packages/tests/fixtures/account-deletion-convex/local/mcp-provenance.json'
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(record))

    def test_exact_bytes_allow_only_bun_install_tag(self):
        result = verify_mcp(self.root, {**self.hashes, '.bun-tag-deadbeef': 'metadata'})
        self.assertEqual(result['files'], 1)

    def test_tampered_missing_and_extra_code_fail(self):
        for hashes in ({}, {'dist/component/tokens.js': 'modified'},
                       {**self.hashes, 'unexpected.js': 'new'},
                       {**self.hashes, 'dist/.bun-tag-deadbeef': 'new'}):
            with self.subTest(hashes=hashes):
                with self.assertRaisesRegex(RuntimeError, 'Installed MCP bytes differ'):
                    verify_mcp(self.root, hashes)

    def test_changed_patch_fails(self):
        self.patch.write_text('another patch')
        with self.assertRaisesRegex(RuntimeError, 'selected dependency and patch'):
            verify_mcp(self.root, self.hashes)

    def test_changed_lock_integrity_fails(self):
        self.lock.write_text(self.lock.read_text().replace('sha512-fixture', 'sha512-other'))
        with self.assertRaisesRegex(RuntimeError, 'selected dependency and patch'):
            verify_mcp(self.root, self.hashes)

    def test_changed_catalog_fails(self):
        path = self.root / 'package.json'
        package = json.loads(path.read_text())
        package['catalog']['@convex-dev/mcp'] = 'another'
        package['patchedDependencies']['@convex-dev/mcp@another'] = 'patches/mcp.patch'
        path.write_text(json.dumps(package))
        with self.assertRaisesRegex(RuntimeError, 'selected dependency and patch'):
            verify_mcp(self.root, self.hashes)


if __name__ == '__main__':
    unittest.main()
