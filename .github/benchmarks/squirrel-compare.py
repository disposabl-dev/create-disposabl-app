import json
from pathlib import Path

root = Path('squirrel-manifests')
names = [f'squirrel-{mode}-{repeat}' for mode in ('default', 'fast') for repeat in (1, 2)]
results = {name: json.loads((root / name / 'squirrel-manifest.json').read_text()) for name in names}
baseline = results['squirrel-default-1']
a = baseline['entries']
failed = False
for name, result in results.items():
    b = result['entries']
    missing, added = sorted(a.keys() - b.keys()), sorted(b.keys() - a.keys())
    changed = sorted(k for k in a.keys() & b.keys() if a[k] != b[k])
    print(f'{name}: app entries={len(b)}, missing={len(missing)}, added={len(added)}, changed={len(changed)}')
    for key in ('package_size', 'setup_size'):
        print(f'  {key}: {result[key]} bytes (delta {result[key] - baseline[key]})')
    for label, paths in [('missing', missing), ('added', added), ('changed', changed)]:
        if paths: print('  ' + label + ': ' + ', '.join(paths[:50]))
    changed_non_pe = [path for path in changed if not path.lower().endswith(('.exe', '.dll'))]
    if changed and not changed_non_pe:
        print('  PE byte differences are reported for review; they are not normalized or treated as equivalent.')
    failed |= bool(missing or added or changed_non_pe)
if failed:
    raise SystemExit('Missing or changed non-PE application entries; investigate before considering the optimization')
