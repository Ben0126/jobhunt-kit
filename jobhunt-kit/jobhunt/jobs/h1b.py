"""H-1B records: how many H-1B LCAs and green-card filings (PERM/PWD) an employer actually filed.

The "we sponsor" line in a posting is unreliable; this looks at the filings. Data: github.com/msampath/h1b-sponsor-data
(MIT; built from DOL disclosure data, updated quarterly) — an ~8 MB index downloaded to data/h1b/ (git-ignored),
checked by sha256 and re-downloaded only when the version changes. Turn on with `visa: {h1b_records: true}`.

Levels:
  strong    filed in the last two years, has green-card filings, < 20% placed at client sites
  moderate  filed in the last two years, ≥ 5 filings, < 50% at client sites
  weak      a few filings (< 5) or nothing in 3+ years
  staffing  > 50% placed at client sites (staffing firm)
  none      employer found, no filings
  (blank)   employer not found
F-1 CPT internships don't need H-1B; this tells you whether a return offer could be sponsored.
"""
import gzip
import hashlib
import json
import pathlib
import urllib.request

from jobhunt.util import norm_company

REPO = "msampath/h1b-sponsor-data"
TAG = "index-latest"
POINTER = f"https://github.com/{REPO}/releases/download/{TAG}/index-latest.json"
TIERS = ("strong", "moderate", "weak", "staffing", "none")


class H1BError(Exception):
    pass


def _download(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "jobhunt-kit/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def ensure_index(folder: pathlib.Path, fetch=_download):
    """Make sure folder holds the latest index; returns (path, version). Download fails but an old copy exists → use it."""
    folder.mkdir(parents=True, exist_ok=True)
    meta_path = folder / "index.meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    path = folder / "index.ndjson.gz"
    try:
        pointer = json.loads(fetch(POINTER))
        name, digest, version = pointer["filename"], pointer["sha256"], pointer["version"]
    except Exception as e:  # noqa: BLE001
        if path.exists():
            return path, meta.get("version", "")
        raise H1BError(f"can't read the H-1B index version ({e})") from e
    if path.exists() and meta.get("sha256") == digest:
        return path, version
    try:
        raw = fetch(f"https://github.com/{REPO}/releases/download/{TAG}/{name}")
    except Exception as e:  # noqa: BLE001
        if path.exists():
            return path, meta.get("version", "")
        raise H1BError(f"downloading the H-1B index failed ({e})") from e
    if hashlib.sha256(raw).hexdigest() != digest:
        if path.exists():
            return path, meta.get("version", "")
        raise H1BError("H-1B index sha256 mismatch, not used")
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(raw)
    tmp.replace(path)
    meta_path.write_text(json.dumps({"version": version, "sha256": digest, "filename": name}), encoding="utf-8")
    return path, version


def _add(a, r):
    a["filed"] += int(r.get("filed") or 0)
    a["pwd"] += int(r.get("pwd") or 0)
    a["perm"] += int(r.get("perm") or 0)
    a["ly"] = max(a["ly"], int(r.get("ly") or 0))
    a["secondary"] += int(r.get("ns") or 0)


def _new():
    return {"filed": 0, "pwd": 0, "perm": 0, "ly": 0, "secondary": 0}


PREFIX_MIN = 6      # no exact name → employer whose name starts with it; not for short names (Wing, Snap)


def load(path: pathlib.Path, norm, wanted):
    """Index → {normalized name in wanted: summed record}. Same-name entities are summed; when no exact
    name exists, the biggest filer whose name starts with it (Cognizant → Cognizant Technology Solutions)."""
    exact, prefix = {}, {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            key = norm(r.get("n") or "")
            if not key:
                continue
            if key in wanted:
                _add(exact.setdefault(key, _new()), r)
            toks = key.split()
            for n in range(1, len(toks)):
                p = " ".join(toks[:n])
                if p in wanted and len(p) >= PREFIX_MIN:
                    _add(prefix.setdefault(p, {}).setdefault(key, _new()), r)
    out = dict(exact)
    for p, cands in prefix.items():
        if p not in out:
            out[p] = max(cands.values(), key=lambda a: a["filed"] + a["pwd"] + a["perm"])
    return out


def tier(rec, year):
    """Summed record → level (see top of file); None → "" (not found)."""
    if rec is None:
        return ""
    gc = rec["pwd"] + rec["perm"]
    total = rec["filed"] + gc
    if total == 0:
        return "none"
    share = rec["secondary"] / rec["filed"] if rec["filed"] else 0.0
    if share > 0.5:
        return "staffing"
    recent = year - 2 <= rec["ly"] <= year + 1
    if total < 5 or rec["ly"] < year - 3:
        return "weak"
    if gc and recent and share < 0.2:
        return "strong"
    if recent:
        return "moderate"
    return "weak"



def annotate(rows, folder, year) -> list[str]:
    """Fill h1b (level) and h1b_lca (LCA count) on each row. Returns warnings."""
    try:
        path, _ = ensure_index(pathlib.Path(folder))
        idx = load(path, norm_company, {norm_company(r["company"]) for r in rows})
    except Exception as e:  # noqa: BLE001 — no H-1B data never blocks the digest
        return [f"H-1B records: {e}; not annotated this time"]
    for r in rows:
        rec = idx.get(norm_company(r["company"]))
        r["h1b"], r["h1b_lca"] = tier(rec, year), (str(rec["filed"]) if rec else "")
    return []
