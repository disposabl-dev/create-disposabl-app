import json
from pathlib import Path

root = Path('runner-manifests')
manifests = {}
for path in sorted(root.glob('*/stock-runner-manifest.json')):
    manifests[path.parent.name] = json.loads(path.read_text())
expected = {f'web-{label}' for label in (
    'ubuntu-24.04', 'ubuntu-24.04-arm', 'ubuntu-26.04', 'ubuntu-26.04-arm'
)}
if manifests.keys() != expected:
    raise SystemExit(f'Expected manifests {sorted(expected)}, got {sorted(manifests)}')
reference = manifests['web-ubuntu-24.04']
for name, current in manifests.items():
    only_reference = sorted(reference.keys() - current.keys())
    only_current = sorted(current.keys() - reference.keys())
    changed = sorted(path for path in reference.keys() & current.keys()
                     if reference[path] != current[path])
    shared = reference.keys() & current.keys()
    assets = sorted(path for path in shared if path.startswith('assets/') and path.endswith(('.js', '.css')))
    same_assets = sum(reference[path] == current[path] for path in assets)
    print(f'{name}: {len(current)} files; missing={len(only_reference)}, added={len(only_current)}, '
          f'changed={len(changed)}; common JS/CSS assets with equal SHA-256={same_assets}/{len(assets)}')
    for title, paths in [('missing', only_reference), ('added', only_current), ('changed', changed)]:
        if paths:
            print(f'  {title}: {", ".join(paths[:30])}')
