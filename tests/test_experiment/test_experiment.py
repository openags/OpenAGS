"""Tests for experiment sandbox and engine."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.research.experiment.sandbox import (
    ExecutionResult,
    LocalSandbox,
    SandboxFactory,
)
from openags.research.experiment.engine import ExperimentEngine
from openags.models import Experiment, SandboxMode
from tests.conftest import MockBackend


# ── Sandbox tests ──────────────────────────────────────


class TestExecutionResult:
    def test_dataclass_fields(self) -> None:
        r = ExecutionResult(returncode=0, stdout="ok", stderr="")
        assert r.returncode == 0
        assert r.stdout == "ok"
        assert r.stderr == ""

    def test_nonzero_return(self) -> None:
        r = ExecutionResult(returncode=1, stdout="", stderr="error")
        assert r.returncode == 1


class TestLocalSandbox:
    @pytest.mark.asyncio
    async def test_execute_success(self, tmp_path: Path) -> None:
        sandbox = LocalSandbox(tmp_path, timeout=10)
        result = await sandbox.execute("echo hello")
        assert result.returncode == 0
        assert "hello" in result.stdout

    @pytest.mark.asyncio
    async def test_execute_failure(self, tmp_path: Path) -> None:
        sandbox = LocalSandbox(tmp_path, timeout=10)
        result = await sandbox.execute("exit 42")
        assert result.returncode == 42

    @pytest.mark.asyncio
    async def test_execute_with_env(self, tmp_path: Path) -> None:
        sandbox = LocalSandbox(tmp_path, timeout=10)
        result = await sandbox.execute("echo $MY_VAR", env={"MY_VAR": "testval"})
        assert "testval" in result.stdout

    @pytest.mark.asyncio
    async def test_execute_timeout(self, tmp_path: Path) -> None:
        sandbox = LocalSandbox(tmp_path, timeout=1)
        with pytest.raises(TimeoutError):
            await sandbox.execute("sleep 30")

    @pytest.mark.asyncio
    async def test_cleanup_is_noop(self, tmp_path: Path) -> None:
        sandbox = LocalSandbox(tmp_path, timeout=10)
        await sandbox.cleanup()  # should not raise

    @pytest.mark.asyncio
    async def test_execute_python_script(self, tmp_path: Path) -> None:
        script = tmp_path / "test.py"
        script.write_text("print('computed: ' + str(2+3))")
        sandbox = LocalSandbox(tmp_path, timeout=10)
        result = await sandbox.execute("python test.py")
        assert result.returncode == 0
        assert "computed: 5" in result.stdout

    @pytest.mark.asyncio
    async def test_execute_python_error(self, tmp_path: Path) -> None:
        script = tmp_path / "bad.py"
        script.write_text("raise ValueError('boom')")
        sandbox = LocalSandbox(tmp_path, timeout=10)
        result = await sandbox.execute("python bad.py")
        assert result.returncode != 0
        assert "boom" in result.stderr


class TestSandboxFactory:
    @pytest.mark.asyncio
    async def test_create_local(self, tmp_path: Path) -> None:
        factory = SandboxFactory(SandboxMode.LOCAL)
        sandbox = await factory.create(tmp_path, timeout=10)
        assert isinstance(sandbox, LocalSandbox)

    @pytest.mark.asyncio
    async def test_create_docker(self, tmp_path: Path) -> None:
        from openags.research.experiment.sandbox import DockerSandbox

        factory = SandboxFactory(SandboxMode.DOCKER)
        sandbox = await factory.create(tmp_path, timeout=10)
        assert isinstance(sandbox, DockerSandbox)


# ── Engine tests ───────────────────────────────────────


class TestExperimentEngine:
    @pytest.mark.asyncio
    async def test_successful_experiment(self, tmp_path: Path) -> None:
        script = tmp_path / "exp.py"
        script.write_text("print('result: 42')")

        exp = Experiment(
            id="exp1",
            project_id="test",
            name="test-exp",
            code_path=script,
        )

        backend = MockBackend()
        engine = ExperimentEngine(backend, SandboxMode.LOCAL, max_fix_attempts=3)
        result = await engine.run(exp)

        assert result.success
        assert result.attempts == 1
        assert "result: 42" in result.data["stdout"]
        assert result.duration_seconds > 0

    @pytest.mark.asyncio
    async def test_failed_experiment_no_fix(self, tmp_path: Path) -> None:
        """Experiment fails and auto-fix returns same code (no change)."""
        script = tmp_path / "bad.py"
        script.write_text("raise RuntimeError('broken')")

        exp = Experiment(
            id="exp2",
            project_id="test",
            name="bad-exp",
            code_path=script,
        )

        # Mock backend returns no code fix
        backend = MockBackend(responses=["I cannot fix this code."])
        engine = ExperimentEngine(backend, SandboxMode.LOCAL, max_fix_attempts=2)
        result = await engine.run(exp)

        assert not result.success
        assert "broken" in (result.error or "")

    @pytest.mark.asyncio
    async def test_auto_fix_succeeds(self, tmp_path: Path) -> None:
        """Experiment fails, auto-fix provides working code, second attempt succeeds."""
        script = tmp_path / "fixable.py"
        script.write_text("raise RuntimeError('initial bug')")

        exp = Experiment(
            id="exp3",
            project_id="test",
            name="fixable-exp",
            code_path=script,
        )

        # Backend returns fixed code on first call (the fix request)
        fixed_code = "print('fixed and working')"
        backend = MockBackend(responses=[f"```python\n{fixed_code}\n```"])
        engine = ExperimentEngine(backend, SandboxMode.LOCAL, max_fix_attempts=3)
        result = await engine.run(exp)

        assert result.success
        assert result.attempts == 2
        # Verify the file was actually modified
        assert script.read_text() == fixed_code

    @pytest.mark.asyncio
    async def test_gpu_env(self) -> None:
        exp = Experiment(
            id="exp4",
            project_id="test",
            name="gpu-exp",
            code_path=Path("/tmp/dummy.py"),
            gpu_count=3,
        )
        assert ExperimentEngine._gpu_env(exp) == "0,1,2"

    @pytest.mark.asyncio
    async def test_gpu_env_zero(self) -> None:
        exp = Experiment(
            id="exp5",
            project_id="test",
            name="cpu-exp",
            code_path=Path("/tmp/dummy.py"),
            gpu_count=0,
        )
        assert ExperimentEngine._gpu_env(exp) == ""


class TestExtractCode:
    def test_extract_python_block(self) -> None:
        text = "Here's the fix:\n```python\nprint('hello')\n```\nDone."
        assert ExperimentEngine._extract_code(text) == "print('hello')"

    def test_extract_no_code(self) -> None:
        assert ExperimentEngine._extract_code("No code here") is None

    def test_extract_empty_block(self) -> None:
        text = "```python\n```"
        assert ExperimentEngine._extract_code(text) is None

    def test_extract_multiline(self) -> None:
        text = "```python\nimport os\nprint(os.getcwd())\n```"
        result = ExperimentEngine._extract_code(text)
        assert result is not None
        assert "import os" in result
        assert "print(os.getcwd())" in result
