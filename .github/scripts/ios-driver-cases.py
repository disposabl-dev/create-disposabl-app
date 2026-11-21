import re
import sys
from pathlib import Path

log = re.sub(r"\x1b\[[0-9;]*m", "", Path(sys.argv[1]).read_text())
expected = [
    "mobile settings are available before login",
    "mobile creation can be dismissed before submitting",
    "mobile guides show the introduction and learning paths",
    "mobile home renders",
    "disabled authentication blocks the retained password link",
    "mobile chat presents local conversation states",
    "Guides pauses when leaving playback and keeps guest actions available",
    "mobile username login survives restart and signs out",
    "iPhone Duo shows both Discover actions when unfolded",
]
for index, name in enumerate(expected):
    assert log.count(name) == 1, f"Missing or duplicated case: {name}"
    line = next(line for line in log.splitlines() if name in line)
    assert ("✓" if index < 4 else "↓") in line, f"Unexpected outcome: {name}"
assert re.search(r"Tests\s+4 passed\s*\|\s*5 skipped\s*\(9\)", log), "Unexpected test outcomes"
print("Verified 4 passed and 5 skipped with the expected case identities")
