"""Object segmentation and feature extraction inside a cell.

Each connected dark component inside a cell becomes an object described by
shape, fill, size, rotation and position, using the same conventions as the
TypeScript model (lib/matrigma/types.ts):
  size      circumradius / (0.4 * cell size)
  rotation  degrees clockwise from the canonical "pointing up" orientation
  x, y      centre relative to the cell (0..1)
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

PERIOD = {"circle": 0, "square": 90, "diamond": 90, "triangle": 120, "pentagon": 72, "hexagon": 60,
          "star": 72, "arrow": 360, "cross": 90, "line": 180}


@dataclass
class ExtractedObject:
    shape: str
    fill: float
    size: float
    rotation: float
    x: float
    y: float
    confidence: float
    bbox: list[int]  # in cell-crop coordinates

    def to_json(self) -> dict:
        return {"shape": self.shape, "fill": self.fill, "size": round(self.size, 3), "rotation": round(self.rotation, 1),
                "x": round(self.x, 3), "y": round(self.y, 3)}


def _angle_cw_from_up(dx: float, dy: float) -> float:
    return (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0


def _circular_mean(angles: list[float], period: float) -> float:
    if not angles:
        return 0.0
    k = 2 * math.pi / period
    s = sum(math.sin(a * k) for a in angles)
    c = sum(math.cos(a * k) for a in angles)
    return (math.atan2(s, c) / k) % period


def _quantize(angle: float, step: float, period: float) -> float:
    if period == 0:
        return 0.0
    q = round(angle / step) * step
    return q % period


def _polygon_rotation(vertices: np.ndarray, cx: float, cy: float, period: float, base: float = 0.0) -> tuple[float, float]:
    angs = [(_angle_cw_from_up(float(x) - cx, float(y) - cy) - base) % period for x, y in vertices]
    mean = _circular_mean(angs, period)
    spread = max(min(abs(a - mean), period - abs(a - mean)) for a in angs) if angs else 0
    return mean, spread


def classify(contour: np.ndarray, cell_size: float) -> tuple[str, float, float, float, float, float]:
    """Return (shape, rotation, size, cx, cy, confidence)."""
    area = cv2.contourArea(contour)
    perim = cv2.arcLength(contour, True)
    hull = cv2.convexHull(contour)
    hull_area = max(cv2.contourArea(hull), 1.0)
    solidity = area / hull_area
    circularity = 4 * math.pi * area / max(perim * perim, 1.0)
    (rcx, rcy), (rw, rh), _rang = cv2.minAreaRect(contour)
    elong = max(rw, rh) / max(1.0, min(rw, rh))
    m = cv2.moments(contour)
    cx = m["m10"] / m["m00"] if m["m00"] else rcx
    cy = m["m01"] / m["m00"] if m["m00"] else rcy
    pts = contour.reshape(-1, 2).astype(np.float64)
    stroke_half = 0.0125 * cell_size
    unit = 0.4 * cell_size

    def circum_size(ccx: float, ccy: float) -> float:
        r = float(np.max(np.hypot(pts[:, 0] - ccx, pts[:, 1] - ccy)))
        return max(0.0, r - stroke_half) / unit

    # Tiny blobs (dots): polygon corners are not resolvable at this scale.
    r_max_c = float(np.max(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)))
    if r_max_c < max(8.0, 0.075 * cell_size) and solidity > 0.8 and elong < 1.6:
        return "circle", 0.0, circum_size(cx, cy), cx, cy, 0.8

    if elong > 4.0:
        # Line: orientation of the long axis, 0 = vertical
        vx, vy = _principal_axis(pts)
        rot = _quantize(_angle_cw_from_up(vx, vy) % 180, 15, 180)
        size = (max(rw, rh) / 2) / unit
        return "line", rot, size, rcx, rcy, 0.9

    approx_hull = cv2.approxPolyDP(hull, 0.04 * cv2.arcLength(hull, True), True).reshape(-1, 2)
    nh = len(approx_hull)

    if solidity < 0.9:
        # Concave shapes: star (10 vertices), cross (12), arrow (7).
        n_raw = len(cv2.approxPolyDP(contour, 0.02 * perim, True))
        if solidity < 0.64 and n_raw >= 9 and n_raw <= 11 or (solidity < 0.6 and n_raw < 12):
            outer = cv2.approxPolyDP(hull, 0.06 * cv2.arcLength(hull, True), True).reshape(-1, 2)
            rot, spread = _polygon_rotation(outer, cx, cy, 72)
            conf = 0.9 if len(outer) == 5 else 0.6
            return "star", _quantize(rot, 3, 72), circum_size(cx, cy), cx, cy, conf
        if n_raw >= 11 or (solidity < 0.74 and n_raw > 8):
            # Arm axis from the outer corners (the 8 vertices farthest from the centre).
            verts = cv2.approxPolyDP(contour, 0.02 * perim, True).reshape(-1, 2).astype(np.float64)
            d = np.hypot(verts[:, 0] - rcx, verts[:, 1] - rcy)
            outer = verts[d > 0.8 * d.max()]
            rot, _ = _polygon_rotation(outer, rcx, rcy, 90)
            rot = rot if min(rot, 90 - rot) > 7 else 0.0
            r_max = float(np.max(np.hypot(pts[:, 0] - rcx, pts[:, 1] - rcy)))
            size = (r_max / 1.044 - stroke_half) / unit
            return "cross", _quantize(rot, 15, 90), size, rcx, rcy, 0.85 if n_raw == 12 else 0.6
        direction, half_len, conf = _arrow_direction(pts, contour)
        conf *= 1.0 if 6 <= n_raw <= 8 else 0.6
        return "arrow", _quantize(direction, 15, 360), (half_len - stroke_half) / unit, rcx, rcy, conf

    radii = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    roundness = float(radii.min() / max(radii.max(), 1e-6))
    if (circularity > 0.9 and nh >= 7) or (roundness > 0.9 and circularity > 0.85):
        return "circle", 0.0, circum_size(cx, cy), cx, cy, min(1.0, 0.5 + (roundness - 0.85) * 5)
    if nh == 3:
        rot, spread = _polygon_rotation(approx_hull, cx, cy, 120)
        return "triangle", _quantize(rot, 15, 120), circum_size(cx, cy), cx, cy, 0.95 if spread < 10 else 0.7
    if nh == 4:
        rot, spread = _polygon_rotation(approx_hull, cx, cy, 90)
        # vertices at 45 (mod 90) => axis aligned square; at 0 => diamond
        if min(abs(rot - 45), 90 - abs(rot - 45)) <= 22.5:
            return "square", _quantize((rot - 45) % 90, 15, 90), circum_size(cx, cy), cx, cy, 0.95
        return "diamond", _quantize(rot % 90, 15, 90) if min(rot, 90 - rot) > 7 else 0.0, circum_size(cx, cy), cx, cy, 0.95
    if nh == 5:
        rot, _ = _polygon_rotation(approx_hull, cx, cy, 72)
        return "pentagon", _quantize(rot, 3, 72), circum_size(cx, cy), cx, cy, 0.85
    if nh == 6:
        rot, _ = _polygon_rotation(approx_hull, cx, cy, 60)
        return "hexagon", _quantize(rot, 3, 60), circum_size(cx, cy), cx, cy, 0.85
    if circularity > 0.82:
        return "circle", 0.0, circum_size(cx, cy), cx, cy, 0.6
    return "unknown", 0.0, circum_size(cx, cy), cx, cy, 0.2


def _principal_axis(pts: np.ndarray) -> tuple[float, float]:
    mean = pts.mean(axis=0)
    cov = np.cov((pts - mean).T)
    evals, evecs = np.linalg.eigh(cov)
    v = evecs[:, int(np.argmax(evals))]
    return float(v[0]), float(v[1])


def _arrow_direction(pts: np.ndarray, contour: np.ndarray) -> tuple[float, float, float]:
    """Direction of an arrow: along its long axis, towards the wide head."""
    x, y, w, h = cv2.boundingRect(contour)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.drawContours(mask, [contour - [x - 1, y - 1]], -1, 255, -1)
    ys, xs = np.nonzero(mask)
    P = np.stack([xs, ys], axis=1).astype(np.float64)
    ux, uy = _principal_axis(P)
    c = P.mean(axis=0)
    t = (P - c) @ np.array([ux, uy])
    s = (P - c) @ np.array([-uy, ux])
    mid = (t.min() + t.max()) / 2
    lo = t < mid
    w_lo = float(np.abs(s[lo]).max()) if lo.any() else 0.0
    w_hi = float(np.abs(s[~lo]).max()) if (~lo).any() else 0.0
    sign = 1.0 if w_hi > w_lo else -1.0
    conf = min(1.0, abs(w_hi - w_lo) / max(w_hi, w_lo, 1.0) * 2.5)
    half_len = float(t.max() - t.min()) / 2
    return _angle_cw_from_up(sign * ux, sign * uy), half_len, max(0.3, conf)


def _fill_ratio(crop_bin: np.ndarray, contour: np.ndarray, cell_size: float) -> float | None:
    mask = np.zeros_like(crop_bin)
    cv2.drawContours(mask, [contour], -1, 255, -1)
    k = max(2, int(round(0.035 * cell_size)))
    interior = cv2.erode(mask, np.ones((2 * k + 1, 2 * k + 1), np.uint8))
    n = int(np.count_nonzero(interior))
    if n < 12:
        return None
    return float(np.count_nonzero(crop_bin[interior > 0])) / n


def quantize_fill(r: float | None) -> float:
    if r is None:
        return 1.0
    if r < 0.25:
        return 0.0
    if r > 0.75:
        return 1.0
    return 0.5


def extract_objects(gray: np.ndarray, box: tuple[int, int, int, int]) -> tuple[list[ExtractedObject], float]:
    """Segment the objects inside one cell. Returns (objects, quality 0..1)."""
    x, y, w, h = box
    size = float(min(w, h))
    inset = max(3, int(round(0.04 * size)))
    crop = gray[y + inset:y + h - inset, x + inset:x + w - inset]
    if crop.size == 0:
        return [], 0.0
    # Dark ink on light background. Otsu adapts to the actual contrast; guard
    # against an empty cell where Otsu would split noise.
    if float(crop.max()) - float(crop.min()) < 40:
        return [], 1.0
    _, bin_ = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, hierarchy = cv2.findContours(bin_, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    objs: list[ExtractedObject] = []
    if hierarchy is None:
        return [], 1.0
    min_area = 0.0015 * size * size
    ch, cw = bin_.shape
    for i, c in enumerate(contours):
        if hierarchy[0][i][3] != -1:
            continue  # hole
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        bx, by, bw, bh = cv2.boundingRect(c)
        # Remnants of the cell border (touch the crop edge and are thin & long)
        touches = bx <= 0 or by <= 0 or bx + bw >= cw or by + bh >= ch
        if touches and (bw > 0.8 * cw or bh > 0.8 * ch) and area < 0.1 * cw * ch:
            continue
        shape, rot, osize, ocx, ocy, conf = classify(c, size)
        fill = quantize_fill(_fill_ratio(bin_, c, size)) if shape != "line" else 1.0
        if shape in ("line",):
            fill = 1.0
        objs.append(ExtractedObject(
            shape=shape, fill=fill, size=float(osize), rotation=float(rot) % (PERIOD.get(shape) or 360 or 1) if PERIOD.get(shape) else 0.0,
            x=(ocx + inset) / w, y=(ocy + inset) / h, confidence=conf,
            bbox=[int(bx + inset), int(by + inset), int(bw), int(bh)],
        ))
    quality = float(np.mean([o.confidence for o in objs])) if objs else 1.0
    if any(o.shape == "unknown" for o in objs):
        quality *= 0.5
    return objs, quality


def is_texture_cell(gray: np.ndarray, box: tuple[int, int, int, int]) -> bool:
    """True for a line-pattern cell (families of thin lines or a cross-hatched
    mesh). Such cells cannot be described as a few shapes, so the pipeline
    reports them as unsupported instead of misreading them."""
    x, y, w, h = box
    size = float(min(w, h))
    inset = max(3, int(round(0.04 * size)))
    crop = gray[y + inset:y + h - inset, x + inset:x + w - inset]
    if crop.size == 0 or float(crop.max()) - float(crop.min()) < 40:
        return False
    _, bin_ = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, hierarchy = cv2.findContours(bin_, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return False
    min_area = 0.0015 * size * size
    min_hole = max(4.0, 0.0006 * size * size)
    holes: dict[int, int] = {}
    for i, c in enumerate(contours):
        parent = hierarchy[0][i][3]
        if parent != -1 and cv2.contourArea(c) >= min_hole:
            holes[parent] = holes.get(parent, 0) + 1
    thin_lines = 0
    for i, c in enumerate(contours):
        if hierarchy[0][i][3] != -1 or cv2.contourArea(c) < min_area:
            continue
        if holes.get(i, 0) >= 4:
            return True
        if classify(c, size)[0] == "line":
            thin_lines += 1
    return thin_lines >= 4
