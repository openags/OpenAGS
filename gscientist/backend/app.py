import os
import yaml
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routes import project_routes, agent_routes
from gscientist.agents.gs_agent import GSAgent
from gscientist.agents.agent_registry import AgentRegistry
from gscientist.tools.builtins.paper_search.arxiv import ArxivSearcher

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    logging.debug("Starting up the application...")
    """Initialize and register GSAgent on startup."""
    try:
        # Load config
        config_path = os.path.join("config", "config.yml")
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)

        # Initialize ArxivSearcher tool
        arxiv_searcher = ArxivSearcher()
        arxiv_tools = arxiv_searcher.get_tools()

        # Create and register GSAgent
        agent = GSAgent("GSAgent", config, tools=arxiv_tools)
        AgentRegistry.register_agent("GSAgent", agent)
    except Exception as e:
        print(f"Error initializing GSAgent: {e}")
    logging.debug("Application startup complete. Registered routes:")
    for route in app.routes:
        if hasattr(route, 'methods'):
            logging.debug(f"Route: {route.path} | Methods: {route.methods}")
        else:
            logging.debug(f"Route: {route.path} | Methods: Not Applicable")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(project_routes.router, prefix="/api/projects", tags=["Projects"])
app.include_router(agent_routes.router, prefix="/api/agents", tags=["Agents"])

# Serve static files (frontend)
app.mount("/", StaticFiles(directory="ui/frontend", html=True), name="frontend")

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to the GScientist Backend API!"}