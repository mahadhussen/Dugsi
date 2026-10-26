"""Compare vision output with ground truth for rendered fixtures."""
from __future__ import annotations

import json
import math
from pathlib import Path

from vision.objects import PERIOD
from vision.pipeline import analyze

FIXTURES = Path(__file__).resolve().parents[2] / "test-data" / "screenshots"


def rot_dist(shape: str, a: float, b: float) -> float:
    p = PERIOD.get(shape, 0)
    if not p:
        return 0.0
    d = abs((a - b) % p)
    return min(d, p - d)


def match_cell(pred: dict, truth: dict) -> dict:
    """Greedy match objects by position; report per-attribute agreement."""
    res = {"count": len(pred["objects"]) == len(truth["objects"]), "shape": 0, "fill": 0, "rot": 0, "size": 0, "n": 0}
    used = set()
    for t in truth["objects"]:
        best, bd = None, 1e9
        for i, p in enumerate(pred["objects"]):
            if i in used:
                continue
            d = math.hypot(p["x"] - t["x"], p["y"] - t["y"])
            if d < bd:
                best, bd = i, d
        if best is None or bd > 0.12:
            continue
        used.add(best)
        p = pred["objects"][best]
        res["n"] += 1
        t_shape = t["shape"]
        res["shape"] += p["shape"] == t_shape
        res["fill"] += abs(p["fill"] - t["fill"]) < 0.1
        res["rot"] += p["shape"] == t_shape and rot_dist(t_shape, p["rotation"], t["rotation"]) <= 10
        res["size"] += abs(p["size"] - t["size"]) <= 0.07
    return res


def evaluate(path: Path) -> dict:
    truth = json.loads(path.with_suffix(".json").read_text())
    out = analyze(path.read_bytes())
    report = {"id": truth["id"], "ok": out.get("ok", False), "error": out.get("error")}
    if not out.get("ok"):
        return report
    tp = truth["problem"]
    pp = out["problem"]
    report["layout"] = pp["rows"] == tp["rows"] and pp["cols"] == tp["cols"] and len(pp["options"]) == len(tp["options"])
    report["missing_ok"] = [i for i, c in enumerate(pp["cells"]) if c is None] == [i for i, c in enumerate(tp["cells"]) if c is None]
    agg = {"count": 0, "cells": 0, "shape": 0, "fill": 0, "rot": 0, "size": 0, "n": 0, "truth_objects": 0}
    pairs = list(zip(pp["cells"], tp["cells"])) + list(zip(pp["options"], tp["options"]))
    for p, t in pairs:
        if p is None or t is None:
            continue
        m = match_cell(p, t)
        agg["cells"] += 1
        agg["count"] += m["count"]
        agg["truth_objects"] += len(t["objects"])
        for k in ("shape", "fill", "rot", "size", "n"):
            agg[k] += m[k]
    report.update(agg)
    report["quality"] = out["quality"]
    return report


if __name__ == "__main__":
    import sys

    files = sorted(FIXTURES.glob("*.png"))
    tot: dict = {}
    for f in files:
        r = evaluate(f)
        flag = "" if r.get("ok") and r.get("count") == r.get("cells") and r.get("shape") == r.get("n") and r.get("fill") == r.get("n") and r.get("rot") == r.get("n") else "  <--"
        if "-v" in sys.argv or flag:
            print(r["id"], {k: v for k, v in r.items() if k != "id"}, flag)
        for k, v in r.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                tot[k] = tot.get(k, 0) + v
            elif isinstance(v, bool):
                tot[k] = tot.get(k, 0) + int(v)
    print("TOTAL", tot)
