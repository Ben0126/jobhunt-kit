import subprocess

import pytest

from jobhunt import config
from jobhunt.scaffold import init


def git(root, *args):
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin:/usr/local/bin"})


@pytest.fixture
def workspace(tmp_path):
    """A fresh workspace from the template, committed, with no job sources configured."""
    root = tmp_path / "ws"
    init.create(root)
    text = (root / "jobhunt.yaml").read_text(encoding="utf-8")
    (root / "jobhunt.yaml").write_text(text.replace("h1b_records: true", "h1b_records: false"), encoding="utf-8")
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "init")
    return root


@pytest.fixture
def cfg(workspace):
    return config.load(workspace)
