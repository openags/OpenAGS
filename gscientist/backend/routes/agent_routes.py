# routes/agent_routes.py
from fastapi import APIRouter, Body, HTTPException
from gscientist.agents.agent_registry import AgentRegistry
from gscientist.agents.agent import Agent
from pydantic import BaseModel
from typing import Dict
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)

router = APIRouter()

class StepRequest(BaseModel):
    input_data: str

@router.post("/{name}/step")
async def agent_step(name: str, step_input: StepRequest):
    logging.debug(f"Received POST request at /api/agents/{name}/step")
    logging.debug(f"Request body: {step_input}")
    agent = AgentRegistry.get_agent(name)
    if not agent:
        logging.error(f"Agent '{name}' not found in registry.")
        raise HTTPException(status_code=404, detail="Agent not found.")
    try:
        logging.debug(f"Agent '{name}' found. Executing step...")
        response = agent.step(step_input.input_data)
        logging.debug(f"Agent '{name}' responded with: {response}")
        return {"response": response}
    except Exception as e:
        logging.error(f"Error during agent step: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/register")
def register_agent(name: str):
    """Register a new agent."""
    if name in AgentRegistry.list_agents():
        raise HTTPException(status_code=400, detail="Agent already exists.")
    agent = Agent(name=name)  # Example: Create a basic agent instance
    AgentRegistry.register_agent(name, agent)
    return {"message": f"Agent '{name}' registered successfully."}

@router.get("/")
def list_agents():
    """List all registered agents."""
    return {"agents": AgentRegistry.list_agents()}

@router.get("/{name}")
def get_agent(name: str):
    """Retrieve an agent by name."""
    agent = AgentRegistry.get_agent(name)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return {"name": agent.name}

@router.delete("/{name}")
def remove_agent(name: str):
    """Remove an agent by name."""
    if not AgentRegistry.get_agent(name):
        raise HTTPException(status_code=404, detail="Agent not found.")
    AgentRegistry.remove_agent(name)
    return {"message": f"Agent '{name}' removed successfully."}
