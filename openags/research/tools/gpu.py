"""GPU detection and allocation utility.

Detects available GPUs via:
  1. nvidia-smi (NVIDIA GPUs)
  2. torch.cuda (if PyTorch installed)
  3. Apple MPS detection (macOS)

No hard dependency on torch or nvidia-smi — gracefully degrades.
"""

from __future__ import annotations

import asyncio
import logging
import platform

from openags.models import GPUConfig, GPUInfo

logger = logging.getLogger(__name__)


async def detect_gpus() -> list[GPUInfo]:
    """Auto-detect available GPUs. Tries nvidia-smi first, then torch."""
    # Try NVIDIA GPUs via nvidia-smi
    gpus = await _detect_nvidia_smi()
    if gpus:
        return gpus

    # Try PyTorch CUDA
    gpus = _detect_torch_cuda()
    if gpus:
        return gpus

    # Try Apple MPS
    mps = _detect_mps()
    if mps:
        return mps

    return []


async def _detect_nvidia_smi() -> list[GPUInfo]:
    """Detect NVIDIA GPUs using nvidia-smi CLI."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            "--query-gpu=index,name,memory.total,memory.free,utilization.gpu",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode != 0:
            return []

        gpus: list[GPUInfo] = []
        for line in stdout.decode().strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5:
                gpus.append(GPUInfo(
                    index=int(parts[0]),
                    name=parts[1],
                    memory_total_mb=int(float(parts[2])),
                    memory_free_mb=int(float(parts[3])),
                    utilization_percent=float(parts[4]),
                ))
        return gpus

    except (FileNotFoundError, TimeoutError):
        return []


def _detect_torch_cuda() -> list[GPUInfo]:
    """Detect GPUs via PyTorch CUDA (if installed)."""
    try:
        import torch

        if not torch.cuda.is_available():
            return []

        gpus: list[GPUInfo] = []
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            mem_total = props.total_memory // (1024 * 1024)
            mem_free = mem_total  # Approximate (torch doesn't report free easily)
            try:
                mem_free = (
                    torch.cuda.mem_get_info(i)[0] // (1024 * 1024)
                )
            except Exception:
                pass

            gpus.append(GPUInfo(
                index=i,
                name=props.name,
                memory_total_mb=mem_total,
                memory_free_mb=mem_free,
            ))
        return gpus

    except ImportError:
        return []


def _detect_mps() -> list[GPUInfo]:
    """Detect Apple MPS (Metal Performance Shaders) on macOS."""
    if platform.system() != "Darwin":
        return []

    try:
        import torch

        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return [GPUInfo(
                index=0,
                name="Apple MPS",
                memory_total_mb=0,  # MPS shares system memory
                memory_free_mb=0,
            )]
    except ImportError:
        pass

    return []


def allocate_gpus(
    available: list[GPUInfo],
    config: GPUConfig,
    requested: int = 1,
) -> list[int]:
    """Select GPU device IDs based on config and availability.

    Priority:
      1. Explicit device_ids from config
      2. GPUs with most free memory
    """
    if config.device_ids:
        return config.device_ids[:requested]

    # Sort by free memory (descending), then filter by max_memory_gb
    candidates = sorted(available, key=lambda g: g.memory_free_mb, reverse=True)

    if config.max_memory_gb is not None:
        min_mb = int(config.max_memory_gb * 1024)
        candidates = [g for g in candidates if g.memory_total_mb >= min_mb]

    return [g.index for g in candidates[:requested]]


def build_cuda_env(device_ids: list[int]) -> dict[str, str]:
    """Build environment variables for GPU allocation."""
    if not device_ids:
        return {}
    return {"CUDA_VISIBLE_DEVICES": ",".join(str(i) for i in device_ids)}
