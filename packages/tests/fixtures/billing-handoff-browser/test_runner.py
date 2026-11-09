"""Inert boundary checks; no backend or browser starts."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

RUNNER = Path(__file__).with_name('run.py')
SPEC = importlib.util.spec_from_file_location('handoff_runner', RUNNER)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def test_inherited_sandbox_flag_cannot_skip_exec(self):
        with patch.object(sys, 'argv', ['run.py']), patch.dict(os.environ, {'BILLING_FIXTURE_SANDBOXED': '1'}):
            with patch.object(runner.os, 'execve', side_effect=RuntimeError('exec intercepted')) as execute:
                with self.assertRaisesRegex(RuntimeError, 'exec intercepted'):
                    runner.main()
        path, argv, env = execute.call_args.args
        self.assertEqual(path, '/usr/bin/sandbox-exec')
        self.assertIn(runner.PROFILE, argv)
        self.assertNotIn('BILLING_FIXTURE_SANDBOXED', env)
        self.assertIn('guarded_fixture', argv[-3])
        self.assertEqual(argv[-1], 'handoff')

    def test_only_fixed_modes_are_accepted(self):
        for mode in ('handoff', 'receipt'):
            with patch.object(sys, 'argv', ['run.py', mode]), patch.object(runner.os, 'execve', side_effect=RuntimeError('exec intercepted')) as execute:
                with self.assertRaisesRegex(RuntimeError, 'exec intercepted'):
                    runner.main()
                self.assertEqual(execute.call_args.args[1][-1], mode)
        for args in (['run.py', 'other'], ['run.py', 'receipt', 'extra']):
            with patch.object(sys, 'argv', args), patch.object(runner.os, 'execve') as execute:
                with self.assertRaises(SystemExit): runner.main()
                execute.assert_not_called()

    def test_guard_installed_before_preparation_and_restored(self):
        previous = signal.getsignal(signal.SIGTERM)
        def preparation(_owner, _mode):
            self.assertNotEqual(signal.getsignal(signal.SIGTERM), previous)
            raise ValueError('preparation failed')
        with patch.object(runner, 'run_fixture', preparation):
            with self.assertRaisesRegex(ValueError, 'preparation failed'):
                runner.guarded_fixture()
        self.assertEqual(signal.getsignal(signal.SIGTERM), previous)

    def cancelled_preparation(self, low_disk):
        with tempfile.TemporaryDirectory(prefix='handoff-runner-test-') as directory:
            pidfile = Path(directory) / 'child.pid'
            child = f'import os,time; open({str(pidfile)!r}, "w").write(str(os.getpid())); time.sleep(30)'
            script = f'''
import importlib.util, sys
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location('runner', {str(RUNNER)!r})
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
owner = r.load(r.ROOT / 'packages/tests/helpers/sdk-auth/run.py', 'owner')
if {low_disk!r}:
    r.shutil.disk_usage = lambda _: SimpleNamespace(free=0)
with r.disk_guard():
    r.command(owner, [sys.executable, '-c', {child!r}])
'''
            process = subprocess.Popen([sys.executable, '-c', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not pidfile.exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertTrue(pidfile.exists(), 'preparation child did not start')
                child_pid = int(pidfile.read_text())
                if not low_disk:
                    process.send_signal(signal.SIGTERM)
                stdout, stderr = process.communicate(timeout=5)
                self.assertEqual(process.returncode, 143, stderr.decode())
                if low_disk:
                    self.assertIn(b'Disk threshold reached', stdout)
                with self.assertRaises(ProcessLookupError):
                    os.kill(child_pid, 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()

    def test_sigterm_reaps_preparation_child(self):
        self.cancelled_preparation(False)

    def test_low_disk_reaps_preparation_child(self):
        self.cancelled_preparation(True)


if __name__ == '__main__':
    unittest.main()
