import hashlib
import json
import os
from pathlib import Path

root = Path('apps/web/dist/client')
files = sorted(path for path in root.rglob('*') if path.is_file())
manifest = {
    path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in files
}
output = Path(os.environ['RUNNER_TEMP']) / 'stock-runner-manifest.json'
output.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Web client: {len(files)} files; manifest: {output}')
if len(files) != 172:
    raise SystemExit('Expected 172 emitted Web client files; inspect manifest before comparing.')
