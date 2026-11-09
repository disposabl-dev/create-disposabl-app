"""Process cancellation regression; no Convex, network, credentials or database."""
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import time
import unittest


LAUNCHER = r'''
import sys, time, signal
sys.path.insert(0, sys.argv[1])
import run as fixture
mode = sys.argv[2]
command = [sys.executable, '-u', '-c',
    'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print("ready", flush=True); time.sleep(60)']
if mode == 'starting':
    original = fixture.subprocess.Popen
    def delayed(*args, **kwargs):
        child = original(*args, **kwargs)
        assert child.stdout.readline().strip() == 'ready'
        print(child.pid, flush=True)
        time.sleep(.5)
        return child
    fixture.subprocess.Popen = delayed
with fixture.owned_backend(command, stop_timeout=.25, stdout=fixture.subprocess.PIPE, text=True) as child:
    if mode != 'starting':
        assert child.stdout.readline().strip() == 'ready'
        print(child.pid, flush=True)
    if mode == 'normal':
        pass
    elif mode == 'failure':
        raise RuntimeError('synthetic fixture failure')
    else:
        signal.pause()
'''


class RunnerCancellation(unittest.TestCase):
    def check_exit(self, mode, signum=None, repeated=False):
        child_pid = None
        launcher = subprocess.Popen(
            [sys.executable, '-u', '-c', LAUNCHER, str(Path(__file__).parent), mode],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            self.assertTrue(select.select([launcher.stdout], [], [], 5)[0], 'child startup timed out')
            child_pid = int(launcher.stdout.readline())
            if signum is not None:
                launcher.send_signal(signum)
                if repeated:
                    time.sleep(.05)
                    launcher.send_signal(signum)
            stdout, stderr = launcher.communicate(timeout=5)
            expected = 128 + signum if signum is not None else (1 if mode == 'failure' else 0)
            self.assertEqual(launcher.returncode, expected, stderr)
            self.assertIn('owned backend stopped', stdout)
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
            child_pid = None
        finally:
            if launcher.poll() is None:
                launcher.kill()
                launcher.wait()
            if child_pid is not None:
                try:
                    os.kill(child_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            launcher.stdout.close()
            launcher.stderr.close()

    def test_normal_exit(self):
        self.check_exit('normal')

    def test_exception(self):
        self.check_exit('failure')

    def test_sigterm(self):
        self.check_exit('running', signal.SIGTERM)

    def test_sigint(self):
        self.check_exit('running', signal.SIGINT)

    def test_sigterm_during_start(self):
        self.check_exit('starting', signal.SIGTERM)

    def test_repeated_sigterm_during_cleanup(self):
        self.check_exit('running', signal.SIGTERM, repeated=True)


if __name__ == '__main__':
    unittest.main()
