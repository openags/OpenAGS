
"""
Command execution tool for the Auto-Research framework.

This module defines a simple command line execution tool,
which can be integrated as a FunctionTool with agents,
to allow them to run shell commands safely.

"""

import subprocess
from camel.toolkits.function_tool import FunctionTool

def run_command(command: str) -> str:
    """
    Execute a shell command and return the output or error.

    Args:
        command (str): The shell command to execute.

    Returns:
        str: The standard output or error message.
    """
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            return f"[Error] Command failed with code {result.returncode}:\n{result.stderr.strip()}"
    except subprocess.TimeoutExpired:
        return "[Error] Command timed out."
    except Exception as e:
        return f"[Exception] {str(e)}"

def get_tools():
    """
    Return the list of FunctionTool objects for this module.
    """
    return [
        FunctionTool(run_command, name="run_command", description="Execute a shell command and get output.")
    ]

if __name__ == "__main__":
    # Simple test
    print(run_command("echo Hello, Auto-Research!"))