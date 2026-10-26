"""Matrix, cell and answer-option detection.

Works on screenshots that also contain browser chrome, text, timers and
buttons: square boxes are detected, grouped by size, and the group that forms
a tight lattice is taken as the matrix. A second group of equally sized boxes
arranged in one or two rows is taken as the answer options.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Box:
    x: int
    y: int
    w: int
    h: int

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def area(self) -> int:
        return self.w * self.h

    def contains(self, o: "Box", pad: int = 2) -> bool:
        return self.x - pad <= o.x and self.y - pad <= o.y and o.x + o.w <= self.x + self.w + pad and o.y + o.h <= self.y + self.h + pad

    def iou(self, o: "Box") -> float:
        ix = max(0, min(self.x + self.w, o.x + o.w) - max(self.x, o.x))
        iy = max(0, min(self.y + self.h, o.y + o.h) - max(self.y, o.y))
        inter = ix * iy
        return inter / float(self.area + o.area - inter)

    def as_list(self) -> list[int]:
        return [int(self.x), int(self.y), int(self.w), int(self.h)]


class DetectionError(Exception):
    def __init__(self, stage: str, message: str, region: Box | None = None, boxes: list[Box] | None = None):
        super().__init__(message)
        self.stage = stage
        self.region = region
        self.boxes = boxes or []


def square_boxes(binary: np.ndarray, edges: np.ndarray) -> list[Box]:
    """Candidate square boxes (cell borders / option borders)."""
    h, w = binary.shape
    min_side = max(20, int(0.03 * min(h, w)))
    max_side = int(0.6 * min(h, w))
    found: list[Box] = []
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    for src in (binary, closed):
        contours, _ = cv2.findContours(src, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            if bw < min_side or bh < min_side or bw > max_side or bh > max_side:
                continue
            if not 0.85 <= bw / bh <= 1.18:
                continue
            area = cv2.contourArea(c)
            if area < 0.85 * bw * bh:
                continue
            approx = cv2.approxPolyDP(c, 0.03 * cv2.arcLength(c, True), True)
            if len(approx) != 4:
                continue
            found.append(Box(x, y, bw, bh))
    # Deduplicate (outer/inner edge of the same border line): keep the inner box.
    found.sort(key=lambda b: b.area)
    out: list[Box] = []
    for b in found:
        if any(b.iou(o) > 0.75 or (o.contains(b, 4) and b.contains(o, 8)) for o in out):
            continue
        out.append(b)
    return out


def _cluster_1d(values: list[float], tol: float) -> list[float]:
    centers: list[list[float]] = []
    for v in sorted(values):
        if centers and abs(v - np.mean(centers[-1])) <= tol:
            centers[-1].append(v)
        else:
            centers.append([v])
    return [float(np.mean(c)) for c in centers]


def _size_groups(boxes: list[Box]) -> list[list[Box]]:
    groups: list[list[Box]] = []
    for b in sorted(boxes, key=lambda b: -b.w):
        for g in groups:
            ref = np.median([x.w for x in g])
            if abs(b.w - ref) <= 0.1 * ref and abs(b.h - np.median([x.h for x in g])) <= 0.1 * ref:
                g.append(b)
                break
        else:
            groups.append([b])
    return [g for g in groups if len(g) >= 2]


@dataclass
class Lattice:
    rows: int
    cols: int
    xs: list[float]
    ys: list[float]
    size: float
    cells: dict[tuple[int, int], Box]

    @property
    def missing(self) -> list[tuple[int, int]]:
        return [(r, c) for r in range(self.rows) for c in range(self.cols) if (r, c) not in self.cells]

    def slot_box(self, r: int, c: int) -> Box:
        s = int(round(self.size))
        return Box(int(round(self.xs[c] - s / 2)), int(round(self.ys[r] - s / 2)), s, s)

    @property
    def bbox(self) -> Box:
        s = self.size
        x0 = min(self.xs) - s / 2
        y0 = min(self.ys) - s / 2
        return Box(int(x0), int(y0), int(max(self.xs) - min(self.xs) + s), int(max(self.ys) - min(self.ys) + s))


def fit_lattice(group: list[Box]) -> Lattice | None:
    size = float(np.median([b.w for b in group]))
    tol = 0.25 * size
    xs = _cluster_1d([b.cx for b in group], tol)
    ys = _cluster_1d([b.cy for b in group], tol)
    # Fill gaps: a missing column/row appears as a spacing twice the pitch.
    def fill(centers: list[float]) -> list[float]:
        if len(centers) < 2:
            return centers
        pitch = min(np.diff(centers))
        out = [centers[0]]
        for v in centers[1:]:
            while v - out[-1] > 1.5 * pitch:
                out.append(out[-1] + pitch)
            out.append(v)
        return out
    xs, ys = fill(xs), fill(ys)
    cells: dict[tuple[int, int], Box] = {}
    for b in group:
        c = int(np.argmin([abs(b.cx - x) for x in xs]))
        r = int(np.argmin([abs(b.cy - y) for y in ys]))
        if abs(b.cx - xs[c]) <= tol and abs(b.cy - ys[r]) <= tol:
            cells[(r, c)] = b
    return Lattice(len(ys), len(xs), xs, ys, size, cells)


def pitch_ratio(lat: Lattice) -> float:
    pitches = []
    if len(lat.xs) > 1:
        pitches.append(float(np.median(np.diff(lat.xs))))
    if len(lat.ys) > 1:
        pitches.append(float(np.median(np.diff(lat.ys))))
    return (min(pitches) / lat.size) if pitches else 99.0


@dataclass
class Layout:
    matrix: Lattice
    options: list[Box]
    missing: tuple[int, int] | None
    candidates: list[Box]
    inferred_options: int = 0


def detect_layout(binary: np.ndarray, edges: np.ndarray) -> Layout:
    boxes = square_boxes(binary, edges)
    if len(boxes) < 4:
        raise DetectionError("matrix", "Too few box-like regions found; no matrix grid visible.", None, boxes)
    groups = _size_groups(boxes)
    best: Lattice | None = None
    best_group: list[Box] | None = None
    for g in groups:
        lat = fit_lattice(g)
        if lat is None or lat.rows * lat.cols < 4:
            continue
        # A matrix tiles tightly: pitch close to the cell size.
        if lat.rows >= 2 and lat.cols >= 2 and pitch_ratio(lat) <= 1.35:
            if len(lat.cells) < lat.rows * lat.cols - 2:
                continue
            if best is None or lat.size * len(lat.cells) > best.size * len(best.cells):
                best, best_group = lat, g
    if best is None:
        region = max(groups, key=lambda g: sum(b.area for b in g)) if groups else boxes
        xs = [b.x for b in region] + [b.x + b.w for b in region]
        ys = [b.y for b in region] + [b.y + b.h for b in region]
        raise DetectionError(
            "matrix",
            "No tightly packed grid of equally sized cells was found.",
            Box(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)),
            boxes,
        )
    matrix = best
    mb = matrix.bbox
    # Answer options: another group of equal boxes, outside the matrix, in 1-2 rows.
    opt_best: list[Box] | None = None
    for g in groups:
        if g is best_group:
            continue
        g = [b for b in g if not mb.contains(b, 6)]
        if not 3 <= len(g) <= 8:
            continue
        # Must not be nested inside other candidate boxes (objects inside options)
        if any(any(o.contains(b, 2) and o.area > 1.5 * b.area for o in boxes) for b in g):
            continue
        rows = _cluster_1d([b.cy for b in g], 0.3 * np.median([b.h for b in g]))
        if len(rows) > 2:
            continue
        if opt_best is None or np.median([b.w for b in g]) > np.median([b.w for b in opt_best]):
            opt_best = g
    if opt_best is None:
        raise DetectionError("options", "The matrix was found but no row of answer options was detected.", mb, boxes)
    # Order options: top-to-bottom rows, then left-to-right
    rows = _cluster_1d([b.cy for b in opt_best], 0.3 * np.median([b.h for b in opt_best]))
    options = sorted(opt_best, key=lambda b: (int(np.argmin([abs(b.cy - r) for r in rows])), b.cx))
    options, inferred = _fill_option_gaps(options, rows)
    missing = matrix.missing
    return Layout(matrix, options, missing[0] if len(missing) == 1 else None, boxes, inferred)


def _fill_option_gaps(options: list[Box], rows: list[float]) -> tuple[list[Box], int]:
    """An option whose border is broken (e.g. by a large figure) leaves a gap in
    the evenly spaced row. Insert an inferred box of the same size there."""
    if len(options) < 3:
        return options, 0
    out: list[Box] = []
    inferred = 0
    for r in rows:
        row = [b for b in options if int(np.argmin([abs(b.cy - x) for x in rows])) == rows.index(r)]
        row.sort(key=lambda b: b.cx)
        if len(row) < 2:
            out.extend(row)
            continue
        pitch = float(np.min(np.diff([b.cx for b in row])))
        filled = [row[0]]
        for b in row[1:]:
            while b.cx - filled[-1].cx > 1.5 * pitch:
                p = filled[-1]
                filled.append(Box(int(round(p.x + pitch)), p.y, p.w, p.h))
                inferred += 1
            filled.append(b)
        out.extend(filled)
    return out, inferred
