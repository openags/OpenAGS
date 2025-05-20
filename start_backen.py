import uvicorn

def start_server():
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run("gscientist.server.main:app", host="0.0.0.0", port=8000, reload=False)

if __name__ == "__main__":
    start_server()
