"""nao skills — install nao-published Claude skills into .claude/skills/."""

from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import tarfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from cyclopts import Parameter

from nao_core.tracking import track_command
from nao_core.ui import UI

DEFAULT_REGISTRY_URL = "https://skills.getnao.io/registry.json"
SKILLS_DIR = Path(".claude/skills")
LOCK_FILE = SKILLS_DIR / ".nao-skills-lock.json"


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
            url = f"{registry_base.rstrip('/')}/{url.lstrip('/')}"
        return cls(
            name=d["name"],
            description=d["description"],
            version=d.get("version", ""),
            tarball_url=url,
            sha256=d.get("sha256", ""),
        )


def _registry_url() -> str:
    return os.environ.get("NAO_SKILLS_REGISTRY", DEFAULT_REGISTRY_URL)


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
    base = url.rsplit("/", 1)[0]
    return [RegistryEntry.from_dict(base, s) for s in data.get("skills", [])]


def _load_lock() -> dict:
    if LOCK_FILE.exists():
        return json.loads(LOCK_FILE.read_text())
    return {"installed": {}}


def _save_lock(lock: dict) -> None:
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    LOCK_FILE.write_text(json.dumps(lock, indent=2) + "\n")


def _install_one(entry: RegistryEntry) -> None:
    target = SKILLS_DIR / entry.name
    UI.print(f"  downloading {entry.tarball_url}")
    raw = _fetch(entry.tarball_url)

    # SHA-256 is mandatory. Without it we'd be extracting an unauthenticated
    # tarball into the user's project — refuse rather than fall back.
    if not entry.sha256:
        UI.error(f"  registry entry for {entry.name} is missing sha256; refusing to install.")
        raise SystemExit(1)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != entry.sha256:
        UI.error(f"  checksum mismatch for {entry.name}: expected {entry.sha256}, got {actual}")
        raise SystemExit(1)

    if target.exists():
        shutil.rmtree(target)

    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    skills_root = SKILLS_DIR.resolve()
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        # Validate every member resolves inside SKILLS_DIR before extracting.
        # Defends against path-traversal (../../etc/passwd) and absolute paths
        # in the archive — an attacker who compromised the registry but not
        # our SHA-256 verification still can't escape the install dir.
        for member in tar.getmembers():
            member_path = (skills_root / member.name).resolve()
            try:
                member_path.relative_to(skills_root)
            except ValueError as e:
                UI.error(f"  unsafe member path in {entry.name} tarball: {member.name}")
                raise SystemExit(1) from e
            if member.issym() or member.islnk():
                link_target = (member_path.parent / member.linkname).resolve()
                try:
                    link_target.relative_to(skills_root)
                except ValueError as e:
                    UI.error(f"  unsafe symlink in {entry.name} tarball: {member.name} -> {member.linkname}")
                    raise SystemExit(1) from e
        tar.extractall(SKILLS_DIR)  # noqa: S202 — members validated above

    lock = _load_lock()
    lock["installed"][entry.name] = {
        "version": entry.version,
        "sha256": entry.sha256,
        "tarball_url": entry.tarball_url,
    }
    _save_lock(lock)

    UI.success(f"  {entry.name} ({entry.version})")


@track_command("skills")
def skills(
    *,
    update: Annotated[
        bool,
        Parameter(
            name="--update",
            help=(
                "Refresh skills whose registry checksum has drifted from the local copy. "
                "Overwrites any local edits to those skills without warning — drift detection "
                "is registry-side only and does not check installed files."
            ),
        ),
    ] = False,
    force: Annotated[
        bool,
        Parameter(name=["-f", "--force"], help="Reinstall every skill, overwriting local edits."),
    ] = False,
):
    """Install nao skills into .claude/skills/.

    Default behavior: install every skill from the published registry. Skills
    already present and up-to-date are left alone. Skills present but drifted
    from the registry are reported and skipped (your local edits are preserved).

    Pass --update to refresh drifted skills to the latest registry version.
    Pass --force to reinstall everything regardless of state.

    Note on local edits: drift detection compares the registry checksum to the
    one recorded at install time, not to the actual files on disk. If you
    edited an installed skill locally, --update will overwrite your edits
    without warning whenever the registry version also changed. If you want
    to keep local edits, copy them out first or skip --update for that skill.
    """
    UI.title("nao skills")
    registry = _load_registry()
    lock = _load_lock()
    installed = lock.get("installed", {})

    UI.print()
    counts = {"installed": 0, "updated": 0, "unchanged": 0, "skipped": 0}
    for entry in registry:
        info = installed.get(entry.name)
        target_exists = (SKILLS_DIR / entry.name).exists()
        in_sync = bool(info and entry.sha256 and entry.sha256 == info.get("sha256") and target_exists)

        if not info or not target_exists:
            _install_one(entry)
            counts["installed"] += 1
        elif in_sync and not force:
            UI.print(f"  [dim]= {entry.name} ({entry.version}) — up to date[/dim]")
            counts["unchanged"] += 1
        elif update or force:
            _install_one(entry)
            counts["updated"] += 1
        else:
            UI.print(f"  [yellow]~ {entry.name} — locally modified (use --update to refresh)[/yellow]")
            counts["skipped"] += 1

    UI.print()
    parts = [f"{n} {k}" for k in ("installed", "updated", "unchanged", "skipped") if (n := counts[k])]
    UI.success(", ".join(parts) + "." if parts else "Nothing to do.")
