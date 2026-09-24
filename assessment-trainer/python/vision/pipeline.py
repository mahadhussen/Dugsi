"""End-to-end screenshot analysis: preprocessing -> layout -> objects -> JSON."""
from __future__ import annotations

import time

import numpy as np

from .detect import Box, DetectionError, detect_layout
from .objects import extract_objects
from .preprocess import preprocess


def _to_original(b: Box | list[int], scale: float) -> list[int]:
    x, y, w, h = b.as_list() if isinstance(b, Box) else b
    return [int(round(v / scale)) for v in (x, y, w, h)]


def analyze(data: bytes) -> dict:
    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    try:
        pre = preprocess(data)
    except ValueError as e:
        return {"ok": False, "stage": "decode", "error": str(e)}
    timings["preprocess_ms"] = (time.perf_counter() - t0) * 1000
    scale = pre.scale
    base = {
        "imageSize": [int(pre.original_shape[1]), int(pre.original_shape[0])],
        "preprocessing": pre.steps,
    }
    t1 = time.perf_counter()
    try:
        layout = detect_layout(pre.binary, pre.edges)
    except DetectionError as e:
        return {
            **base,
            "ok": False,
            "stage": e.stage,
            "error": str(e),
            "region": _to_original(e.region, scale) if e.region else None,
            "candidateBoxes": [_to_original(b, scale) for b in e.boxes[:60]],
            "timings": timings,
        }
    timings["detect_ms"] = (time.perf_counter() - t1) * 1000
    lat = layout.matrix
    if layout.missing is None:
        n_missing = len(lat.missing)
        return {
            **base,
            "ok": False,
            "stage": "missing_cell",
            "error": (
                "No missing cell could be identified (every grid slot contains a cell)."
                if n_missing == 0
                else f"{n_missing} grid slots have no detected cell; expected exactly one missing cell."
            ),
            "region": _to_original(lat.bbox, scale),
            "candidateBoxes": [_to_original(b, scale) for b in lat.cells.values()],
            "timings": timings,
        }
    t2 = time.perf_counter()
    cells: list[dict | None] = []
    debug_cells = []
    qualities = []
    for r in range(lat.rows):
        for c in range(lat.cols):
            box = lat.cells.get((r, c))
            if box is None:
                cells.append(None)
                debug_cells.append({"row": r, "col": c, "box": _to_original(lat.slot_box(r, c), scale), "missing": True, "objects": []})
                continue
            objs, q = extract_objects(pre.gray, (box.x, box.y, box.w, box.h))
            qualities.append(q)
            cells.append({"objects": [o.to_json() for o in objs]})
            debug_cells.append({
                "row": r, "col": c, "box": _to_original(box, scale), "missing": False,
                "objects": [{**o.to_json(), "confidence": round(o.confidence, 2),
                             "bbox": _to_original([box.x + o.bbox[0], box.y + o.bbox[1], o.bbox[2], o.bbox[3]], scale)} for o in objs],
            })
    options = []
    debug_options = []
    for b in layout.options:
        objs, q = extract_objects(pre.gray, (b.x, b.y, b.w, b.h))
        qualities.append(q)
        options.append({"objects": [o.to_json() for o in objs]})
        debug_options.append({
            "box": _to_original(b, scale),
            "objects": [{**o.to_json(), "confidence": round(o.confidence, 2),
                         "bbox": _to_original([b.x + o.bbox[0], b.y + o.bbox[1], o.bbox[2], o.bbox[3]], scale)} for o in objs],
        })
    timings["objects_ms"] = (time.perf_counter() - t2) * 1000

    # Extraction quality: object classification confidence, grid regularity,
    # and sanity checks (every cell/option contains something).
    sizes = [b.w for b in lat.cells.values()]
    regularity = 1.0 - min(1.0, float(np.std(sizes) / max(np.mean(sizes), 1)) * 5)
    empty = sum(1 for c in cells if c is not None and not c["objects"]) + sum(1 for o in options if not o["objects"])
    obj_q = float(np.mean(qualities)) if qualities else 0.0
    quality = obj_q * (0.7 + 0.3 * regularity) * (0.6 if empty else 1.0) * (0.85 if layout.inferred_options else 1.0)
    timings["total_ms"] = (time.perf_counter() - t0) * 1000
    mr, mc = layout.missing
    return {
        **base,
        "ok": True,
        "matrix": {"rows": lat.rows, "columns": lat.cols},
        "missingCell": [mr, mc],
        "answerOptions": len(options),
        "problem": {"rows": lat.rows, "cols": lat.cols, "cells": cells, "options": options},
        "quality": round(quality, 3),
        "qualityFactors": {"objects": round(obj_q, 3), "gridRegularity": round(regularity, 3), "emptyCells": empty, "inferredOptions": layout.inferred_options},
        "debug": {"matrixBox": _to_original(lat.bbox, scale), "cells": debug_cells, "options": debug_options},
        "timings": {k: round(v, 1) for k, v in timings.items()},
    }
