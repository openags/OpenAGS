import os
import subprocess
import webbrowser
import time
import socket

def start_backend():
    """Start the FastAPI backend using uvicorn."""
    backend_command = [
        "uvicorn",
        "gscientist.backend.app:app",
        "--reload",
        "--host", "127.0.0.1",
        "--port", "8000"
    ]
    return subprocess.Popen(backend_command)

def wait_for_backend(host, port, timeout=30):
    """Wait for the backend to be ready."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection((host, port), timeout=2):
                print("Backend is ready.")
                return True
        except (socket.timeout, ConnectionRefusedError):
            print("Waiting for backend to be ready...")
            time.sleep(1)
    raise TimeoutError(f"Backend did not start within {timeout} seconds.")

def main():
    """Start backend and open the browser."""
    print("Starting backend...")
    backend_process = start_backend()

    # Wait for the backend to be ready
    try:
        wait_for_backend("127.0.0.1", 8000)
    except TimeoutError as e:
        print(e)
        backend_process.terminate()
        return

    print("Opening browser...")
    webbrowser.open("http://127.0.0.1:8000")

    try:
        # Keep the script running to allow manual termination
        print("Backend is running. Press Ctrl+C to stop.")
        backend_process.wait()
    except KeyboardInterrupt:
        print("Shutting down...")
        backend_process.terminate()

if __name__ == "__main__":
    main()