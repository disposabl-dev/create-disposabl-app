"""Process cancellation regression; no Convex, network, credentials or database."""
import os
from pathlib import Path
import select
import signal
import socket
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
    def test_helper_import_without_script_directory(self):
        result = subprocess.run([
            sys.executable, '-B', '-c',
            'import importlib.util,sys; '
            'spec=importlib.util.spec_from_file_location("sdk_runner",sys.argv[1]); '
            'module=importlib.util.module_from_spec(spec); '
            'spec.loader.exec_module(module); '
            'assert callable(module.owned_backend)',
            str(Path(__file__).with_name('run.py').resolve()),
        ], cwd='/tmp', capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

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



GROUP_LAUNCHER = r"""
import json, os, sys, signal, subprocess
sys.path.insert(0, sys.argv[1])
import run as fixture
mode = sys.argv[2]
grandchild = 'import signal,socket,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(); print(s.getsockname()[1], flush=True); time.sleep(60)'
leader = 'import subprocess,sys,signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); p=subprocess.Popen([sys.executable,"-u","-c",sys.argv[1]],stdout=subprocess.PIPE,text=True); print(p.pid,p.stdout.readline().strip(),flush=True); ' + ('sys.exit(0)' if mode == 'leader-exit' else 'time.sleep(60)')
with fixture.owned_backend([sys.executable, '-c', 'import time; time.sleep(60)'], stop_timeout=.25) as backend:
    with fixture.owned_backend([sys.executable, '-u', '-c', leader, grandchild], process_group=True, stop_timeout=.25, stdout=subprocess.PIPE, text=True) as runner:
        grand_pid, port = map(int, runner.stdout.readline().split())
        print(json.dumps([backend.pid, runner.pid, grand_pid, port]), flush=True)
        if mode == 'failure':
            raise RuntimeError('synthetic runner failure')
        result = runner.wait()
        if mode == 'leader-exit':
            assert result == 0
            assert runner.wait() == 0
            assert os.waitpid(runner.pid, os.WNOHANG) == (0, 0)
            print('group leader remains pinned after command completion', flush=True)
"""


class RunnerGroupCancellation(unittest.TestCase):
    def check_group(self, mode, signum=None):
        import json
        ids = None
        launcher = subprocess.Popen(
            [sys.executable, '-u', '-c', GROUP_LAUNCHER, str(Path(__file__).parent), mode],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            self.assertTrue(select.select([launcher.stdout], [], [], 5)[0])
            ids = json.loads(launcher.stdout.readline())
            if signum:
                launcher.send_signal(signum)
            stdout, stderr = launcher.communicate(timeout=5)
            self.assertEqual(launcher.returncode, 128 + signum if signum else (1 if mode == 'failure' else 0), stderr)
            self.assertEqual(stdout.count('owned backend stopped'), 2)
            if mode == 'leader-exit':
                self.assertIn('group leader remains pinned after command completion', stdout)
            for pid in ids[:2]:
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)
            # A TERM-ignoring descendant must release its listener too.
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', ids[3]))
        finally:
            if launcher.poll() is None:
                launcher.kill()
                launcher.wait()
            if ids:
                for pid in ids[:3]:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            launcher.stdout.close()
            launcher.stderr.close()

    def test_runner_sigterm(self):
        self.check_group('running', signal.SIGTERM)

    def test_runner_sigint(self):
        self.check_group('running', signal.SIGINT)

    def test_runner_exception(self):
        self.check_group('failure')

    def test_exited_leader_with_running_descendant(self):
        self.check_group('leader-exit')


if __name__ == '__main__':
    unittest.main()
