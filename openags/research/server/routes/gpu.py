"""GPU detection and allocation API routes."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from openags.models import GPUInfo
from openags.research.tools.gpu import allocate_gpus, build_cuda_env, detect_gpus

router = APIRouter()


class AllocateRequest(BaseModel):
    count: int = 1


class AllocateResponse(BaseModel):
    device_ids: list[int]
    cuda_env: dict[str, str]


@router.get("/devices", response_model=list[GPUInfo])
async def list_gpus() -> list[GPUInfo]:
    """Auto-detect available GPUs (NVIDIA, CUDA, MPS)."""
    return await detect_gpus()


@router.post("/allocate", response_model=AllocateResponse)
async def allocate(request: Request, body: AllocateRequest) -> AllocateResponse:
    """Allocate GPUs by free memory. Returns device IDs and CUDA env vars."""
    gpus = await detect_gpus()
    config = request.app.state.config.gpu
    ids = allocate_gpus(gpus, config, requested=body.count)
    return AllocateResponse(device_ids=ids, cuda_env=build_cuda_env(ids))
