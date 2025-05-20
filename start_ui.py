import http.server
import socketserver
import os
import signal
import sys
import socket
import threading

class FrontendHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(os.getcwd(), "ui/frontend"), **kwargs)

def start_ui():
    port = 8080
    shutdown_event = threading.Event()
    
    class ThreadedTCPServer(socketserver.ThreadingTCPServer):
        def server_bind(self):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(self.server_address)
    
    server = ThreadedTCPServer(("", port), FrontendHandler)
    server_thread = threading.Thread(target=server.serve_forever)
    
    def signal_handler(sig, frame):
        print("\nShutting down server...")
        shutdown_event.set()
        server.shutdown()
        server.server_close()
        print("Server stopped")
    
    signal.signal(signal.SIGINT, signal_handler)
    print(f"Starting frontend server on http://localhost:{port}")
    print("Press Ctrl+C to stop the server")
    
    try:
        server_thread.start()
        while not shutdown_event.is_set():
            shutdown_event.wait(1)
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None)

if __name__ == "__main__":
    start_ui()