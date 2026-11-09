"""Inert boundary checks; no backend or browser is launched."""
import importlib.util
from pathlib import Path
import socket
import subprocess
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


if __name__ == '__main__':
    unittest.main()
