
"""
Read and analyze the source code of a local project directory.

This module provides tools to load a codebase,
list files, read content, and summarize code files,
which can be used by agents for understanding or modifying code.

"""

import os
from pathlib import Path
from typing import List, Dict, Optional, Union
from camel.toolkits.function_tool import FunctionTool

def list_code_files(project_path: Union[str, Path], extensions: Optional[List[str]] = None) -> List[str]:
    """
    List all code files in the project directory recursively.

    Args:
        project_path (Union[str, Path]): The root path of the project.
        extensions (Optional[List[str]]): List of file extensions to include (e.g., ['.py', '.md']).
            If None, defaults to common code/text files.

    Returns:
        List[str]: List of file paths (relative to project_path).
    """
    if extensions is None:
        extensions = ['.py', '.md', '.txt', '.json', '.yml', '.yaml', '.ipynb']

    project_path = Path(project_path)
    files = []
    for file in project_path.rglob('*'):
        if file.is_file() and file.suffix in extensions:
            files.append(str(file.relative_to(project_path)))
    return files

def read_file(project_path: Union[str, Path], relative_path: str) -> str:
    """
    Read the content of a file in the project directory.

    Args:
        project_path (Union[str, Path]): The root path of the project.
        relative_path (str): The relative path of the file to read.

    Returns:
        str: The content of the file.
    """
    full_path = Path(project_path) / relative_path
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"[Error reading file {relative_path}]: {str(e)}"

def get_project_summary(project_path: Union[str, Path], max_files: int = 20, max_chars_per_file: int = 1000) -> Dict[str, str]:
    """
    Get a summary of the project by reading a limited number of files
    and truncating their content to a certain length.

    Args:
        project_path (Union[str, Path]): Root project path.
        max_files (int): Maximum number of files to include.
        max_chars_per_file (int): Maximum characters per file content.

    Returns:
        Dict[str, str]: A dictionary mapping relative file paths to their content snippets.
    """
    summary = {}
    files = list_code_files(project_path)
    for file in files[:max_files]:
        content = read_file(project_path, file)
        if len(content) > max_chars_per_file:
            content = content[:max_chars_per_file] + "\n...[truncated]..."
        summary[file] = content
    return summary

def get_tools():
    """
    Return the FunctionTool objects for this module.
    """
    return [
        FunctionTool(list_code_files, name="list_code_files", description="List code/text files in a project."),
        FunctionTool(read_file, name="read_file", description="Read content of a project file."),
        FunctionTool(get_project_summary, name="get_project_summary", description="Get summary of project files."),
    ]

if __name__ == "__main__":
    # Simple test
    project_dir = Path('.')
    print("Listing files:")
    print(list_code_files(project_dir))
    print("\nProject summary:")
    summary = get_project_summary(project_dir)
    for path, content in summary.items():
        print(f"\n--- {path} ---\n{content}")