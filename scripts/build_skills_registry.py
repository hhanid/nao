#!/usr/bin/env python3
"""Build the nao skills registry for Vercel deployment.

Reads `skills/<name>/SKILL.md` for every skill, validates the frontmatter,
packages each skill as a tarball, and writes a static site under `dist/`:

    dist/
    ├── index.html               # human-readable listing
    ├── registry.json            # machine-readable manifest
    └── skills/
        └── <name>/
            ├── manifest.json    # per-skill metadata
            └── <name>.tar.gz    # packaged skill (SKILL.md + templates/, etc.)

The `nao skills` CLI fetches `registry.json` to discover and install skills.

Usage: python scripts/build_skills_registry.py [--version <version>]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import shutil
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write("PyYAML required. Install with: pip install pyyaml\n")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
DIST_DIR = REPO_ROOT / "dist"


@dataclass
class Skill:
    name: str
    description: str
    folder: Path
    files: list[Path]


def parse_frontmatter(skill_md: Path) -> dict:
    text = skill_md.read_text()
    if not text.startswith("---\n"):
        raise ValueError(f"{skill_md}: missing YAML frontmatter (must start with `---`)")
    end = text.find("\n---", 4)
    if end == -1:
        raise ValueError(f"{skill_md}: unterminated YAML frontmatter")
    return yaml.safe_load(text[4:end]) or {}


def collect_skill_files(folder: Path) -> list[Path]:
    """Every file under the skill folder, except hidden / build artefacts."""
    return sorted(
        p for p in folder.rglob("*") if p.is_file() and not any(part.startswith(".") for part in p.relative_to(folder).parts)
    )


def discover_skills() -> list[Skill]:
    skills = []
    for folder in sorted(SKILLS_DIR.iterdir()):
        if not folder.is_dir():
            continue
        skill_md = folder / "SKILL.md"
        if not skill_md.exists():
            print(f"  skip: {folder.name} (no SKILL.md)")
            continue

        meta = parse_frontmatter(skill_md)
        name = meta.get("name", "")
        description = meta.get("description", "")

        if not name:
            raise ValueError(f"{skill_md}: frontmatter missing `name`")
        if name != folder.name:
            raise ValueError(f"{skill_md}: frontmatter name `{name}` != folder name `{folder.name}`")
        if not description:
            raise ValueError(f"{skill_md}: frontmatter missing `description`")

        skills.append(Skill(name=name, description=description, folder=folder, files=collect_skill_files(folder)))

    if not skills:
        raise ValueError(f"No skills found under {SKILLS_DIR}/")
    return skills


def package_skill(skill: Skill, out_dir: Path) -> tuple[Path, str]:
    """Tarball the skill and return (path, sha256)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    tarball = out_dir / f"{skill.name}.tar.gz"
    with tarfile.open(tarball, "w:gz") as tar:
        for f in skill.files:
            tar.add(f, arcname=f"{skill.name}/{f.relative_to(skill.folder)}")
    digest = hashlib.sha256(tarball.read_bytes()).hexdigest()
    return tarball, digest


def render_index_html(skills: list[Skill], version: str, updated_at: str) -> str:
    rows = "\n".join(
        f"""        <tr>
          <td><code>{s.name}</code></td>
          <td>{s.description}</td>
          <td><a href="skills/{s.name}/manifest.json">manifest</a> · <a href="skills/{s.name}/{s.name}.tar.gz">tarball</a></td>
        </tr>"""
        for s in skills
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nao skills</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 960px; margin: 4rem auto; padding: 0 1.5rem; color: #111; }}
  h1 {{ margin-bottom: 0.25rem; }}
  .meta {{ color: #666; font-size: 0.9rem; margin-bottom: 2rem; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ text-align: left; padding: 0.6rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }}
  th {{ font-weight: 600; color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }}
  code {{ background: #f4f4f4; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.9rem; }}
  a {{ color: #0066cc; }}
  .install {{ background: #f8f8f8; padding: 1rem 1.25rem; border-radius: 6px; margin-bottom: 2rem; font-family: ui-monospace, monospace; font-size: 0.9rem; }}
</style>
</head>
<body>
  <h1>nao skills</h1>
  <p class="meta">version <code>{version}</code> · updated {updated_at} · {len(skills)} skills</p>
  <div class="install">$ nao skills install &lt;name&gt;</div>
  <table>
    <thead><tr><th>Name</th><th>Description</th><th>Files</th></tr></thead>
    <tbody>
{rows}
    </tbody>
  </table>
  <p class="meta" style="margin-top: 2rem;">
    Registry: <a href="registry.json">registry.json</a>
  </p>
</body>
</html>
"""


def build(version: str) -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir()

    print(f"Discovering skills in {SKILLS_DIR}/...")
    skills = discover_skills()
    print(f"Found {len(skills)} skills.")

    updated_at = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")

    registry = {
        "version": version,
        "updated_at": updated_at,
        "skills": [],
    }

    for s in skills:
        skill_dir = DIST_DIR / "skills" / s.name
        tarball, digest = package_skill(s, skill_dir)
        rel_tarball = tarball.relative_to(DIST_DIR).as_posix()

        manifest = {
            "name": s.name,
            "description": s.description,
            "version": version,
            "tarball": tarball.name,
            "tarball_url": f"/{rel_tarball}",
            "sha256": digest,
            "files": [f.relative_to(s.folder).as_posix() for f in s.files],
        }
        (skill_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

        registry["skills"].append({
            "name": s.name,
            "description": s.description,
            "version": version,
            "manifest_url": f"/skills/{s.name}/manifest.json",
            "tarball_url": f"/{rel_tarball}",
            "sha256": digest,
        })
        print(f"  packaged: {s.name} ({len(s.files)} files, {tarball.stat().st_size} bytes)")

    (DIST_DIR / "registry.json").write_text(json.dumps(registry, indent=2) + "\n")
    (DIST_DIR / "index.html").write_text(render_index_html(skills, version, updated_at))

    print(f"\n✓ Built registry under {DIST_DIR}/ ({len(skills)} skills, version {version}).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="dev", help="Version tag (e.g. git SHA or release tag)")
    args = parser.parse_args()
    try:
        build(args.version)
    except ValueError as e:
        sys.stderr.write(f"error: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
