"""Run only the real-handoff billing fixture on the assigned isolated ports."""
from pathlib import Path
import sys

original = Path(__file__).resolve().parents[1] / 'billing-handoff-browser/run.py'
source = original.read_text()
replacements = {
    '3530': '3520',
    '3531': '3521',
    "'E2E_BILLING_HANDOFF_BROWSER': '1'": "'E2E_BILLING_WEB_REAL': '1'",
    "flow, output = 'billing-handoff-auth.e2e.ts', '.e2e/billing-handoff-auth'": "flow, output = 'billing-web-handoff.e2e.ts', '.e2e/billing-web-real'",
    "group(['bun', str(source / 'packages/tests/fixtures/billing-handoff-local/prepare.ts'), str(source)], source, 'prepare.log')": "group(['bun', str(source / 'packages/tests/fixtures/billing-handoff-local/prepare.ts'), str(source)], source, 'prepare.log')\n            group(['bun', str(source / 'packages/tests/fixtures/billing-web/prepare-real.ts'), str(source)], source, 'prepare-billing.log')",
}
for before, after in replacements.items():
    if before not in source:
        raise RuntimeError('Existing fixture runner changed: ' + before)
    source = source.replace(before, after)
namespace = {'__file__': __file__, '__name__': 'billing_web_runner'}
exec(compile(source, str(original), 'exec'), namespace)
guarded_fixture = namespace['guarded_fixture']
if __name__ == '__main__':
    if len(sys.argv) != 1:
        raise SystemExit('No arguments are accepted')
    namespace['main']()
