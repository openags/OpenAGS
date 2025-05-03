# run.py
import uvicorn
import http.server
import socketserver
import threading
import os
from concurrent.futures import ThreadPoolExecutor

class FrontendHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to serve files from ui/frontend/"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(os.getcwd(), "ui/frontend"), **kwargs)

def start_fastapi():
    """Start the FastAPI server"""
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run(
        "gscientist.server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False  # Set to True for development
    )

def start_frontend():
    """Start a simple HTTP server for the frontend"""
    port = 8080
    with socketserver.TCPServer(("", port), FrontendHandler) as httpd:
        print(f"Starting frontend server on http://localhost:{port}")
        httpd.serve_forever()

if __name__ == "__main__":
    # Verify config file exists
    config_path = os.path.join("config", "config.yml")
    if not os.path.exists(config_path):
        print(f"Error: Config file not found at {config_path}")
        exit(1)

    # Use ThreadPoolExecutor to run both servers concurrently
    with ThreadPoolExecutor(max_workers=2) as executor:
        # Start FastAPI server
        executor.submit(start_fastapi)
        # Start frontend server
        executor.submit(start_frontend)