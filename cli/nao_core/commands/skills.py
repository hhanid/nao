"""nao skills — list, install, and update nao-published Claude skills."""

from __future__ import annotations

import io
import json
import os
import shutil
import tarfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from cyclopts import App, Parameter

from nao_core.tracking import track_command
from nao_core.ui import UI, ask_confirm

DEFAULT_REGISTRY_URL = "https://skills.getnao.io/registry.json"
SKILLS_DIR = Path(".claude/skills")
LOCK_FILE = SKILLS_DIR / ".nao-skills-lock.json"

skills_app = App(name="skills", help="Manage nao-published Claude skills.")


@dataclass
class RegistryEntry:
    name: str
    description: str
    version: str
    tarball_url: str
    sha256: str

    @classmethod
    def from_dict(cls, registry_base: str, d: dict) -> RegistryEntry:
        url = d["tarball_url"]
        if not url.startswith("http"):
            url = registry_base.rstrip("/") + url
        return cls(
            name=d["name"],
            description=d["description"],
            version=d.get("version", ""),
            tarball_url=url,
            sha256=d.get("sha256", ""),
        )


def _registry_url() -> str:
    return os.environ.get("NAO_SKILLS_REGISTRY", DEFAULT_REGISTRY_URL)


def _registry_base(url: str) -> str:
    return url.rsplit("/", 1)[0]


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "nao-skills-cli"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def _load_registry() -> list[RegistryEntry]:
    url = _registry_url()
    UI.print(f"[dim]Fetching registry: {url}[/dim]")
    try:
        raw = _fetch(url)
    except Exception as e:
        UI.error(f"Failed to fetch registry: {e}")
        raise SystemExit(1) from e
    data = json.loads(raw)
    base = _registry_base(url)
    return [RegistryEntry.from_dict(base, s) for s in data.get("skills", [])]


def _load_lock() -> dict:
    if LOCK_FILE.exists():
        return json.loads(LOCK_FILE.read_text())
    return {"installed": {}}


def _save_lock(lock: dict) -> None:
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    LOCK_FILE.write_text(json.dumps(lock, indent=2) + "\n")


def _install_one(entry: RegistryEntry, *, force: bool = False) -> None:
    target = SKILLS_DIR / entry.name
    if target.exists() and not force:
        UI.warn(f"  {entry.name} already installed at {target}. Use --force to reinstall.")
        return

    UI.print(f"  downloading {entry.tarball_url}")
    raw = _fetch(entry.tarball_url)

    if entry.sha256:
        import hashlib

        actual = hashlib.sha256(raw).hexdigest()
        if actual != entry.sha256:
            UI.error(f"  checksum mismatch for {entry.name}: expected {entry.sha256}, got {actual}")
            raise SystemExit(1)

    if target.exists():
        shutil.rmtree(target)

    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        # Tarballs contain a top-level <name>/ directory; extract into SKILLS_DIR.
        tar.extractall(SKILLS_DIR)  # noqa: S202 — tarballs are signed via sha256 check above

    lock = _load_lock()
    lock["installed"][entry.name] = {
        "version": entry.version,
        "sha256": entry.sha256,
        "tarball_url": entry.tarball_url,
    }
    _save_lock(lock)

    UI.success(f"  installed {entry.name} ({entry.version}) → {target}")


@skills_app.command(name="list")
@track_command("skills:list")
def list_cmd():
    """List nao skills available in the registry."""
    UI.title("nao skills")
    skills = _load_registry()
    lock = _load_lock()
    installed = lock.get("installed", {})

    if not skills:
        UI.warn("Registry is empty.")
        return

    UI.print()
    for s in skills:
        marker = "[green]✓ installed[/green]" if s.name in installed else "[dim]—[/dim]"
        UI.print(f"  [bold]{s.name}[/bold]  {marker}")
        UI.print(f"    [dim]{s.description}[/dim]\n")

    UI.print(f"[dim]{len(skills)} available · {len(installed)} installed[/dim]")
    UI.print()
    UI.print("Install: [cyan]nao skills install <name>[/cyan] (or [cyan]--all[/cyan])")


@skills_app.command(name="install")
@track_command("skills:install")
def install_cmd(
    name: Annotated[str | None, Parameter(help="Skill name to install. Omit with --all for all skills.")] = None,
    *,
    all_: Annotated[bool, Parameter(name=["--all"], help="Install every skill in the registry.")] = False,
    force: Annotated[bool, Parameter(name=["-f", "--force"], help="Reinstall if already present.")] = False,
):
    """Install a nao skill into .claude/skills/."""
    UI.title("Installing nao skills")
    skills = _load_registry()
    by_name = {s.name: s for s in skills}

    if all_:
        targets = skills
    elif name:
        if name not in by_name:
            UI.error(f"Unknown skill: {name}")
            UI.print(f"Available: {', '.join(sorted(by_name))}")
            raise SystemExit(1)
        targets = [by_name[name]]
    else:
        UI.error("Specify a skill name, or pass --all.")
        UI.print("Run [cyan]nao skills list[/cyan] to see what's available.")
        raise SystemExit(1)

    UI.print()
    for s in targets:
        _install_one(s, force=force)
    UI.print()
    UI.success(f"Installed {len(targets)} skill{'s' if len(targets) != 1 else ''}.")


@skills_app.command(name="update")
@track_command("skills:update")
def update_cmd(
    *,
    yes: Annotated[bool, Parameter(name=["-y", "--yes"], help="Skip confirmation.")] = False,
):
    """Update installed skills to the latest registry versions."""
    UI.title("Updating nao skills")
    lock = _load_lock()
    installed = lock.get("installed", {})

    if not installed:
        UI.warn("No skills installed. Run [cyan]nao skills install[/cyan] first.")
        return

    skills = _load_registry()
    by_name = {s.name: s for s in skills}

    to_update: list[RegistryEntry] = []
    for name, info in installed.items():
        entry = by_name.get(name)
        if not entry:
            UI.warn(f"  {name}: not in registry anymore (skipping)")
            continue
        if entry.sha256 and entry.sha256 == info.get("sha256"):
            continue
        to_update.append(entry)

    if not to_update:
        UI.success("All installed skills are up to date.")
        return

    UI.print(f"\nUpdates available for {len(to_update)} skill(s):")
    for s in to_update:
        UI.print(f"  • {s.name} → {s.version}")

    if not yes and not ask_confirm("\nProceed?", default=True):
        UI.print("Cancelled.")
        return

    UI.print()
    for s in to_update:
        _install_one(s, force=True)
    UI.print()
    UI.success(f"Updated {len(to_update)} skill(s).")


# Default subcommand: when the user runs `nao skills` with no subcommand,
# show the list — that's the most useful default.
@skills_app.default
def default_cmd():
    list_cmd()


# Public export — registered on the main app in main.py.
skills = skills_app
