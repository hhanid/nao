"""nao skills — install nao-published Claude skills via the `skills` npm CLI."""

from __future__ import annotations

import shutil
import subprocess

from nao_core.tracking import track_command
from nao_core.ui import UI

SKILLS_REPO = "getnao/nao"


@track_command("skills")
def skills() -> None:
    """Install nao skills into .claude/skills/ via `npx skills add getnao/nao`."""
    UI.title("nao skills")

    if not shutil.which("npx"):
        UI.error("npx not found. Install Node.js (https://nodejs.org) and re-run.")
        raise SystemExit(1)

    cmd = ["npx", "--yes", "skills", "add", SKILLS_REPO]
    UI.print(f"[dim]$ {' '.join(cmd)}[/dim]")

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        raise SystemExit(e.returncode) from e
