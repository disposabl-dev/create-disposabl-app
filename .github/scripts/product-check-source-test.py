"""Offline source-resolution tests with real Git ancestry and tags."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("product-check-source.sh").resolve()
HARNESS = (".github/scripts/product-browser-check.py", ".github/scripts/product-browser-check-test.py",
           "packages/tests/helpers/sdk-auth/run.py", "packages/tests/helpers/sdk-auth/selected_auth.py")

class SourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.git("commit", "--allow-empty", "-qm", "missing harness")
        self.git("tag", "v3.0.0")
        for name in HARNESS:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("same harness\n")
        self.git("add", ".")
        self.git("commit", "-qm", "recovery")
        self.old = self.git("rev-parse", "HEAD")
        self.git("tag", "v1.2.3")
        self.git("tag", "@disposabl/cli@1.2.3")
        (self.repo / "other").write_text("event\n")
        self.git("add", ".")
        self.git("commit", "-qm", "event")
        self.event = self.git("rev-parse", "HEAD")

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True, stderr=subprocess.PIPE).strip()

    def resolve(self, *, ok=True, **overrides):
        self.git("checkout", "-q", "--detach", self.event)
        output = self.repo / "output"
        output.unlink(missing_ok=True)
        env = dict(os.environ, EXPECTED_SOURCE=self.event, EVENT_SHA=self.event, CLI_RECOVERY="",
                   GENERATOR_RECOVERY="", GITHUB_REPOSITORY="example/repo", GITHUB_REF="refs/heads/main",
                   GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_WORKFLOW_REF="example/repo/.github/workflows/publish.yml@refs/heads/main",
                   GITHUB_OUTPUT=str(output))
        env.update(overrides)
        result = subprocess.run(["bash", str(SCRIPT)], cwd=self.repo, env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, ok, result.stderr)
        if not ok:
            self.assertFalse(output.exists())
            return
        sha = output.read_text().strip().removeprefix("sha=")
        self.assertEqual(self.git("rev-parse", "HEAD"), sha)
        return sha

    def test_normal_and_pipeline(self):
        self.assertEqual(self.resolve(GITHUB_EVENT_NAME="push"), self.event)
        self.assertEqual(self.resolve(), self.event)
        self.assertEqual(self.resolve(GITHUB_EVENT_NAME="pull_request", GITHUB_WORKFLOW_REF="example/repo/.github/workflows/pipeline.yml@refs/pull/1/merge", EVENT_SHA="f" * 40), self.event)

    def test_recovery(self):
        self.assertEqual(self.resolve(CLI_RECOVERY="1.2.3"), self.old)
        self.assertEqual(self.resolve(GENERATOR_RECOVERY="1.2.3"), self.old)

    def test_invalid_inputs_and_source_mismatch(self):
        self.resolve(ok=False, CLI_RECOVERY="1.2.3", GENERATOR_RECOVERY="1.2.3")
        self.resolve(ok=False, GENERATOR_RECOVERY="01.2.3")
        self.resolve(ok=False, GENERATOR_RECOVERY="1.2.3", GITHUB_EVENT_NAME="push")
        self.resolve(ok=False, GENERATOR_RECOVERY="1.2.3", GITHUB_WORKFLOW_REF="example/repo/.github/workflows/pipeline.yml@refs/heads/main")
        self.resolve(ok=False, EVENT_SHA="f" * 40)
        self.resolve(ok=False, GITHUB_WORKFLOW_REF="example/repo/.github/workflows/publish.yml@refs/heads/other")
        self.resolve(ok=False, EXPECTED_SOURCE="f" * 40)
        self.resolve(ok=False, GENERATOR_RECOVERY="9.9.9")

    def test_ancestor_and_harness_guard(self):
        self.git("checkout", "-q", "--orphan", "unrelated")
        self.git("commit", "--allow-empty", "-qm", "unrelated")
        self.git("tag", "v2.0.0")
        self.resolve(ok=False, GENERATOR_RECOVERY="2.0.0")
        path = self.repo / HARNESS[0]
        path.write_text("changed harness\n")
        self.git("add", HARNESS[0])
        self.git("commit", "-qm", "change harness")
        self.event = self.git("rev-parse", "HEAD")
        self.resolve(ok=False, GENERATOR_RECOVERY="1.2.3")
        self.resolve(ok=False, CLI_RECOVERY="1.2.3")

    def test_missing_historical_harness(self):
        self.resolve(ok=False, GENERATOR_RECOVERY="3.0.0")

    def test_cli_highest_reachable_tag(self):
        self.git("tag", "@disposabl/cli@1.3.0", self.event)
        self.resolve(ok=False, CLI_RECOVERY="1.2.3")
        self.assertEqual(self.resolve(CLI_RECOVERY="1.3.0"), self.event)


class WorkflowTests(unittest.TestCase):
    def test_publication_gates_and_matrix(self):
        root = SCRIPT.parents[2]
        publish = (root / ".github/workflows/publish.yml").read_text()
        checks = (root / ".github/workflows/product-checks.yml").read_text()
        action = (root / ".github/actions/product-checks/action.yml").read_text()
        pipeline = (root / ".github/workflows/pipeline.yml").read_text()
        self.assertIn("  push:\n    branches: [main]", publish)
        self.assertIn("  workflow_dispatch:", publish)
        self.assertNotIn("needs.resolve", publish)
        self.assertIn("needs: [checks]", publish)
        self.assertNotIn("needs: [checks, cli]", publish)
        self.assertIn("if: always() && !cancelled() && needs.checks.result == 'success'", publish)
        self.assertIn("id: cli-checkout", publish)
        self.assertIn("id: generator-checkout", publish)
        self.assertIn("path: cli-source", publish)
        self.assertIn("path: generator-source", publish)
        self.assertEqual(publish.count("RESOLVED_SHA: ${{ needs.checks.outputs.source_sha }}"), 4)
        self.assertIn("value: ${{ jobs.check.outputs.source_sha }}", checks)
        self.assertIn("source_sha: ${{ steps.checks.outputs.source_sha }}", checks)
        self.assertIn("${{ steps.source.outputs.sha }}", action)
        self.assertIn("source_sha: ${{ github.event.pull_request.head.sha || github.sha }}", pipeline)
        self.assertIn("source_sha: ${{ github.sha }}", publish)
        self.assertIn("cli_recovery_version: ${{ inputs.cli_recovery_version || '' }}", publish)
        self.assertIn("recovery_version: ${{ inputs.recovery_version || '' }}", publish)

if __name__ == "__main__":
    unittest.main()
