"""Plugin system — discover and load third-party skill/tool packages.

Plugins are directories in ~/.openags/plugins/ with a manifest.json:
{
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "...",
    "skills": ["skills/"],
    "tools": []
}

Skills from plugins are loaded into the SkillEngine automatically.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PluginManifest:
    def __init__(self, path: Path, data: dict) -> None:
        self.path = path
        self.name: str = data.get("name", path.name)
        self.version: str = data.get("version", "0.0.0")
        self.description: str = data.get("description", "")
        self.skill_dirs: list[str] = data.get("skills", [])


class PluginManager:
    """Discover and manage plugins from ~/.openags/plugins/."""

    def __init__(self, plugins_dir: Path) -> None:
        self._dir = plugins_dir
        self._plugins: dict[str, PluginManifest] = {}

    def discover(self) -> list[PluginManifest]:
        """Scan plugins directory and load manifests."""
        if not self._dir.exists():
            return []

        found: list[PluginManifest] = []
        for entry in sorted(self._dir.iterdir()):
            if not entry.is_dir():
                continue
            manifest_path = entry / "manifest.json"
            if not manifest_path.exists():
                continue
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest = PluginManifest(entry, data)
                self._plugins[manifest.name] = manifest
                found.append(manifest)
                logger.info("Discovered plugin: %s v%s", manifest.name, manifest.version)
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning("Invalid plugin manifest at %s: %s", manifest_path, e)

        return found

    def get_skill_dirs(self) -> list[Path]:
        """Get all skill directories from all plugins."""
        dirs: list[Path] = []
        for plugin in self._plugins.values():
            for skill_dir in plugin.skill_dirs:
                d = plugin.path / skill_dir
                if d.exists():
                    dirs.append(d)
        return dirs

    def list_plugins(self) -> list[dict]:
        """List all discovered plugins."""
        return [
            {
                "name": p.name,
                "version": p.version,
                "description": p.description,
                "path": str(p.path),
            }
            for p in self._plugins.values()
        ]

    @property
    def count(self) -> int:
        return len(self._plugins)
