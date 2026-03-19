"""WebFetch tool — fetch web page content as clean text.

Supports:
- HTML pages → extracted text (stripped of scripts, styles, nav)
- JSON APIs → formatted JSON
- Plain text → raw content

Uses only stdlib (urllib) — no external dependencies.
"""

from __future__ import annotations

import json
import logging
import re
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)

MAX_RESPONSE_BYTES = 500_000  # 500KB max download
MAX_OUTPUT_CHARS = 50_000     # 50K chars max output
TIMEOUT_SECONDS = 15

# Tags whose content should be removed entirely
_STRIP_TAGS = {"script", "style", "nav", "header", "footer", "noscript", "svg", "iframe"}


class _HTMLTextExtractor(HTMLParser):
    """Extract readable text from HTML, skipping scripts/styles/nav."""

    def __init__(self) -> None:
        super().__init__()
        self._text: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in _STRIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _STRIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            text = data.strip()
            if text:
                self._text.append(text)

    def get_text(self) -> str:
        raw = "\n".join(self._text)
        # Collapse multiple blank lines
        return re.sub(r"\n{3,}", "\n\n", raw).strip()


def _extract_text(html: str) -> str:
    """Extract clean text from HTML."""
    parser = _HTMLTextExtractor()
    parser.feed(html)
    return parser.get_text()


class WebFetchTool:
    """Fetch a URL and return its content as clean text (satisfies Tool protocol)."""

    _name = "fetch"
    _description = (
        "Fetch a web page or API endpoint and return its content as clean text. "
        "Useful for reading documentation, API responses, or online data sources."
    )

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        url = kwargs.get("url", "")
        if not url:
            return ToolResult(success=False, error="'url' is required.")

        if not url.startswith(("http://", "https://")):
            return ToolResult(success=False, error="URL must start with http:// or https://")

        try:
            req = Request(url, headers={
                "User-Agent": "OpenAGS/0.1 (research-agent; +https://github.com/openags/OpenAGS)",
                "Accept": "text/html,application/json,text/plain,*/*",
            })
            with urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                content_type = resp.headers.get("Content-Type", "")
                raw = resp.read(MAX_RESPONSE_BYTES)
                charset = "utf-8"
                if "charset=" in content_type:
                    charset = content_type.split("charset=")[-1].split(";")[0].strip()
                text = raw.decode(charset, errors="replace")

            # JSON response → format nicely
            if "application/json" in content_type:
                try:
                    parsed = json.loads(text)
                    text = json.dumps(parsed, indent=2, ensure_ascii=False)
                except json.JSONDecodeError:
                    pass
            # HTML → extract text
            elif "text/html" in content_type:
                text = _extract_text(text)

            # Truncate
            if len(text) > MAX_OUTPUT_CHARS:
                text = text[:MAX_OUTPUT_CHARS] + f"\n\n[Truncated — {len(text)} chars total]"

            return ToolResult(
                success=True,
                data=text,
                metadata={"url": url, "content_type": content_type, "length": len(text)},
            )

        except HTTPError as e:
            return ToolResult(success=False, error=f"HTTP {e.code}: {e.reason}")
        except URLError as e:
            return ToolResult(success=False, error=f"Connection failed: {e.reason}")
        except TimeoutError:
            return ToolResult(success=False, error=f"Request timed out ({TIMEOUT_SECONDS}s)")
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch (http:// or https://)",
                },
            },
            "required": ["url"],
        }
