import uvicorn
import sys
from pathlib import Path
from gscientist.server.main import app

def start_server():
    # Add the project root directory to Python path
    project_root = Path(__file__).parent.absolute()
    sys.path.insert(0, str(project_root))
    
    print("Starting FastAPI server on http://localhost:8000")
    print(f"Using local code from: {project_root}")
    uvicorn.run("gscientist.server.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start_server()
