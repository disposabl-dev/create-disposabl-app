"""Inert boundary checks; no backend or browser is launched."""
import importlib.util
import contextlib
import io
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('product_browser', Path(__file__).with_name('product-browser-check.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def test_missing_explicit_inputs_fails_before_any_backend(self):
        with patch.dict(runner.os.environ, {}, clear=True), patch.object(runner.sys, 'argv', ['runner']):
            with self.assertRaisesRegex(RuntimeError, 'Supply an executable verified local backend'):
                runner.main()

    def test_occupied_loopback_port_is_rejected(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with patch.object(runner, 'PORTS', (listener.getsockname()[1],)):
                with self.assertRaises(OSError):
                    runner.check_ports()

    def test_listener_inspection_distinguishes_empty_from_error(self):
        with patch.object(runner.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', '')):
            self.assertEqual(runner.listeners(3520), [])
        with patch.object(runner.subprocess, 'run', return_value=subprocess.CompletedProcess([], 2, '', 'error')):
            with self.assertRaisesRegex(RuntimeError, 'Cannot inspect listeners'):
                runner.listeners(3520)

    def test_clean_source_required_before_launching_backend(self):
        with patch.dict(runner.os.environ, {'CONVEX_LOCAL_BINARY': runner.sys.executable,
                                          'PLAYWRIGHT_BROWSERS_PATH': '/tmp',
                                          'PRODUCT_BROWSER_FROZEN_INSTALL': '1'}, clear=True), \
             patch.object(runner.sys, 'argv', ['runner']), \
             patch.object(runner.subprocess, 'check_output', return_value=' M source\n'), \
             patch.object(runner, 'load') as load:
            with self.assertRaisesRegex(RuntimeError, 'clean committed checkout'):
                runner.main()
            load.assert_not_called()

    def test_report_prints_only_counts_not_private_log_content(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'e2e.log'
            path.write_text('private-secret\n Tests  43 passed | 25 skipped (68)\n')
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                runner.report_e2e(path)
            self.assertEqual(output.getvalue(), 'E2E counts: passed=43, skipped=25\n')

    def test_isolation_rejects_root_on_linux(self):
        with patch.object(runner.sys, 'platform', 'linux'), patch.object(runner.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(RuntimeError, 'must not run as root'):
                runner.verify_isolation()


if __name__ == '__main__':
    unittest.main()
