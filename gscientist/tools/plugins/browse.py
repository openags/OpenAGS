
"""
Web browsing tool for Auto-Research framework.

This module provides simple HTTP GET request capability,
and extraction of page title and text content,
which can be integrated as a FunctionTool with agents.

"""

import requests
from bs4 import BeautifulSoup
from camel.toolkits.function_tool import FunctionTool

def fetch_page(url: str, timeout: int = 15) -> dict:
    """
    Fetch a webpage and extract title and main text content.

    Args:
        url (str): The URL to fetch.
        timeout (int): Timeout seconds.

    Returns:
        dict: {
            "url": str,
            "status_code": int,
            "title": str,
            "text": str,
            "error": str (if any)
        }
    """
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        title = soup.title.string.strip() if soup.title else ''
        # Get all visible text
        for script in soup(['script', 'style']):
            script.extract()
        text = soup.get_text(separator=' ', strip=True)
        return {
            "url": url,
            "status_code": response.status_code,
            "title": title,
            "text": text,
            "error": ""
        }
    except Exception as e:
        return {
            "url": url,
            "status_code": -1,
            "title": "",
            "text": "",
            "error": str(e)
        }

def get_tools():
    """
    Return the FunctionTool objects for this module.
    """
    return [
        FunctionTool(fetch_page, name="fetch_page", description="Fetch webpage and extract title and text content."),
    ]

if __name__ == "__main__":
    # Simple test
    url = "https://arxiv.org"
    result = fetch_page(url)
    print(f"Title: {result.get('title')}")
    print(f"Error: {result.get('error')}")
    print(f"Content preview: {result.get('text')[:500]}")