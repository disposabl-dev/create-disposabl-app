import hashlib
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import preflight

class TestPreflight(unittest.TestCase):
    def test_sections_platform_identity_and_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'app.test.preview', 'CFBundleExecutable': 'App'}))
            (p / 'Expo.plist').write_bytes(plistlib.dumps({'EXUpdatesEnabled': False}))
            data = b'http://127.0.0.1:1000 http://127.0.0.1:1001'
            (p / 'main.jsbundle').write_bytes(data)
            record = dict(source_revision='a'*40, js_sha256=hashlib.sha256(data).hexdigest(), app_id='app.test.preview', backend='http://127.0.0.1:1000', site='http://127.0.0.1:1001', e2e=True, telemetry_disabled=True, updates_disabled=True, payments_disabled=True)
            ent = plistlib.dumps({'application-identifier':'local.app.test.preview', 'keychain-access-groups':['local.app.test.preview']})
            ent += b'\0' * (-len(ent) % 4)
            section = '0000000100000000 ' + ' '.join(ent[i:i+4][::-1].hex() for i in range(0,len(ent),4))
            def fake(*args):
                if args[0] == 'git': return 'a'*40
                if args[0] == 'xcrun': return 'platform IOSSIMULATOR'
                if args[0] == 'hermesc': return '\n'.join(f's{i}[ASCII, 0..20]: {url}' for i, url in enumerate((p / 'main.jsbundle').read_text().split()))
                return section if '-s' in args else 'sectname __entitlements\nsectname __ents_der'
            args = (p, record, p, 'app.test.preview', 'local.app.test.preview', record['backend'], record['site'], 'hermesc')
            with patch.object(preflight, 'run', fake):
                preflight.inspect(*args)
                with self.assertRaises(ValueError): preflight.inspect(*args[:4], 'local.wrong.app.test.preview', *args[5:])
                with self.assertRaises(ValueError): preflight.inspect(*args[:5], 'http://example.com:1000', *args[6:])
                record['e2e'] = False
                with self.assertRaises(ValueError): preflight.inspect(*args)
                record['e2e'] = True
                for flag in ('e2e', 'telemetry_disabled', 'updates_disabled', 'payments_disabled'):
                    record[flag] = 1
                    with self.assertRaises(ValueError): preflight.inspect(*args)
                    record[flag] = True
                for suffix in (b'0', b'/private', b'?secret=1'):
                    extended = data.replace(b':1000', b':1000' + suffix)
                    (p / 'main.jsbundle').write_bytes(extended)
                    record['js_sha256'] = hashlib.sha256(extended).hexdigest()
                    with self.assertRaises(ValueError): preflight.inspect(*args)
                (p / 'main.jsbundle').write_bytes(data)
                record['js_sha256'] = hashlib.sha256(data).hexdigest()
                wrong_group = 'local.other.app.test.preview'
                wrong_ent = plistlib.dumps({'application-identifier': wrong_group, 'keychain-access-groups': [wrong_group]})
                wrong_ent += b'\0' * (-len(wrong_ent) % 4)
                section = '0000000100000000 ' + ' '.join(wrong_ent[i:i+4][::-1].hex() for i in range(0,len(wrong_ent),4))
                with self.assertRaises(ValueError): preflight.inspect(*args[:4], wrong_group, *args[5:])
            for bad in ('missing', 'platform'):
                def failure(*cmd):
                    if cmd[0] == 'xcrun': return 'platform IOS' if bad == 'platform' else 'platform IOSSIMULATOR'
                    if cmd[0] == 'otool' and '-l' in cmd: return ''
                    return fake(*cmd)
                with patch.object(preflight, 'run', failure), self.assertRaises(ValueError): preflight.inspect(*args)

if __name__ == '__main__': unittest.main()
