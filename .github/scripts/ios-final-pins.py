#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

p = json.loads(Path('.github/ios-final-connected-pins.json').read_text())
def matches(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None
if not matches(p.get('test_sha'), r'[0-9a-f]{40}'):
    raise SystemExit('Pin the exact test source SHA')
lanes = p.get('include')
if not isinstance(lanes, list) or len(lanes) != 2 or {x.get('label') for x in lanes} != {'cold', 'warm'}:
    raise SystemExit('Pin exactly the cold and warm lanes')
for lane in lanes:
    if not all(matches(lane.get(k), r'[0-9]+') for k in ('run', 'attempt', 'job', 'artifact')):
        raise SystemExit('Run, attempt, job and artifact IDs must be decimal strings')
    if not matches(lane.get('sha'), r'[0-9a-f]{40}') or not matches(lane.get('digest'), r'[0-9a-f]{64}'):
        raise SystemExit('Pin each full source SHA and artifact SHA-256')
    if not matches(lane.get('build'), r'[0-9]+(?:\.[0-9]+){0,2}'):
        raise SystemExit('Pin each installed iOS build number')
if lanes[0]['artifact'] == lanes[1]['artifact'] or lanes[0]['job'] == lanes[1]['job']:
    raise SystemExit('The two builds must have distinct artifacts and jobs')
label = sys.argv[1] if len(sys.argv) > 1 else None
selected = [lane for lane in lanes if label is None or lane['label'] == label]
if not selected:
    raise SystemExit('Unknown simulator test lane')
print('matrix=' + json.dumps({'include': selected}, separators=(',', ':')))
print('test_sha=' + p['test_sha'])
