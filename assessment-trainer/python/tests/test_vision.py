"""Unit tests for the OpenCV pipeline: preprocessing, matrix/cell detection,
object extraction (shape, rotation, fill, count) and error handling."""
from __future__ import annotations

import json
import math

import cv2
import numpy as np
import pytest

from vision.detect import DetectionError, detect_layout, square_boxes
from vision.objects import extract_objects
from vision.pipeline import analyze
from vision.preprocess import preprocess
from tests.harness import FIXTURES, evaluate, rot_dist

CELL = 120


def blank_cell() -> np.ndarray:
    return np.full((CELL, CELL), 255, np.uint8)


def poly(n: int, r: float, rot: float, start: float = -90) -> np.ndarray:
    pts = []
    for i in range(n):
        a = math.radians(start + rot + 360 / n * i)
        pts.append([CELL / 2 + r * math.cos(a), CELL / 2 + r * math.sin(a)])
    return np.array(pts, np.int32)


def encode(img: np.ndarray) -> bytes:
    return cv2.imencode(".png", img)[1].tobytes()


def draw_grid(rows: int, cols: int, missing: tuple[int, int], cell: int = 100, options: int = 6) -> np.ndarray:
    h = 60 + rows * cell + 60 + int(cell * 0.85) + 60
    w = max(cols * cell, options * int(cell * 1.05)) + 120
    img = np.full((h, w), 255, np.uint8)
    x0 = (w - cols * cell) // 2
    for r in range(rows):
        for c in range(cols):
            if (r, c) == missing:
                continue
            x, y = x0 + c * cell, 60 + r * cell
            cv2.rectangle(img, (x, y), (x + cell, y + cell), 60, 2)
            cv2.circle(img, (x + cell // 2, y + cell // 2), cell // 4, 20, -1)
    oc = int(cell * 0.85)
    ox = (w - (options * oc + (options - 1) * 18)) // 2
    oy = 60 + rows * cell + 60
    for i in range(options):
        x = ox + i * (oc + 18)
        cv2.rectangle(img, (x, oy), (x + oc, oy + oc), 60, 2)
        cv2.circle(img, (x + oc // 2, oy + oc // 2), oc // 5, 20, -1)
    return img


# ---------------------------------------------------------------- preprocessing

def test_preprocess_resizes_and_thresholds():
    img = np.full((3000, 4000, 3), 255, np.uint8)
    cv2.rectangle(img, (100, 100), (400, 400), (0, 0, 0), 4)
    pre = preprocess(encode(img))
    assert max(pre.gray.shape) == 2000
    assert pre.scale == pytest.approx(0.5)
    assert pre.binary.dtype == np.uint8 and pre.binary.max() == 255
    assert "grayscale" in pre.steps and "edge detection (Canny)" in pre.steps


def test_decode_error():
    with pytest.raises(ValueError):
        preprocess(b"not an image")


# ---------------------------------------------------------- matrix/cell detection

@pytest.mark.parametrize("rows,cols,missing", [(3, 3, (2, 2)), (2, 2, (1, 1)), (4, 4, (3, 3)), (3, 3, (0, 1))])
def test_matrix_detection_sizes(rows, cols, missing):
    img = draw_grid(rows, cols, missing)
    pre = preprocess(encode(img))
    layout = detect_layout(pre.binary, pre.edges)
    assert (layout.matrix.rows, layout.matrix.cols) == (rows, cols)
    assert layout.missing == missing
    assert len(layout.options) == 6


def test_cell_boxes_are_squares():
    img = draw_grid(3, 3, (2, 2))
    pre = preprocess(encode(img))
    boxes = square_boxes(pre.binary, pre.edges)
    assert len(boxes) >= 8 + 6
    for b in boxes:
        assert 0.85 <= b.w / b.h <= 1.18


def test_no_matrix_raises():
    img = np.full((500, 700), 255, np.uint8)
    cv2.putText(img, "Hello world", (50, 250), cv2.FONT_HERSHEY_SIMPLEX, 2, 0, 3)
    pre = preprocess(encode(img))
    with pytest.raises(DetectionError) as e:
        detect_layout(pre.binary, pre.edges)
    assert e.value.stage == "matrix"


# ------------------------------------------------------------- object extraction

def extract(img: np.ndarray):
    framed = cv2.copyMakeBorder(img, 0, 0, 0, 0, cv2.BORDER_CONSTANT)
    objs, _q = extract_objects(framed, (0, 0, CELL, CELL))
    return objs


@pytest.mark.parametrize("rot", [0, 90, 180, 270])
def test_triangle_rotation(rot):
    img = blank_cell()
    cv2.fillPoly(img, [poly(3, 40, rot)], 0)
    (o,) = extract(img)
    assert o.shape == "triangle"
    assert rot_dist("triangle", o.rotation, rot) <= 8


@pytest.mark.parametrize("direction", [0, 45, 90, 135, 180, 225, 270, 315])
def test_arrow_direction(direction):
    r = 40
    w, hw, hy = r * 0.28, r * 0.7, -r * 0.1
    base = [(0, -r), (hw, hy), (w, hy), (w, r), (-w, r), (-w, hy), (-hw, hy)]
    a = math.radians(direction)
    pts = [(CELL / 2 + x * math.cos(a) - y * math.sin(a), CELL / 2 + x * math.sin(a) + y * math.cos(a)) for x, y in base]
    img = blank_cell()
    cv2.fillPoly(img, [np.array(pts, np.int32)], 0)
    (o,) = extract(img)
    assert o.shape == "arrow"
    assert rot_dist("arrow", o.rotation, direction) <= 10


def test_reflection_is_visible_in_rotation():
    """A mirrored arrow (left vs right) must be distinguishable."""
    left, right = blank_cell(), blank_cell()
    r = 40
    base = [(0, -r), (28, -4), (11, -4), (11, r), (-11, r), (-11, -4), (-28, -4)]
    for img, ang in ((left, 270), (right, 90)):
        a = math.radians(ang)
        pts = [(CELL / 2 + x * math.cos(a) - y * math.sin(a), CELL / 2 + x * math.sin(a) + y * math.cos(a)) for x, y in base]
        cv2.fillPoly(img, [np.array(pts, np.int32)], 0)
    assert extract(left)[0].rotation != extract(right)[0].rotation


@pytest.mark.parametrize("n,shape", [(3, "triangle"), (5, "pentagon"), (6, "hexagon")])
def test_polygon_shapes(n, shape):
    img = blank_cell()
    cv2.fillPoly(img, [poly(n, 42, 0)], 0)
    assert extract(img)[0].shape == shape


def test_square_vs_diamond_and_circle():
    sq, di, ci = blank_cell(), blank_cell(), blank_cell()
    cv2.fillPoly(sq, [poly(4, 40, 0, start=-135)], 0)
    cv2.fillPoly(di, [poly(4, 40, 0, start=-90)], 0)
    cv2.circle(ci, (60, 60), 36, 0, -1)
    assert extract(sq)[0].shape == "square"
    assert extract(di)[0].shape == "diamond"
    assert extract(ci)[0].shape == "circle"


def test_fill_detection():
    solid, empty, half = blank_cell(), blank_cell(), blank_cell()
    cv2.circle(solid, (60, 60), 38, 0, -1)
    cv2.circle(empty, (60, 60), 38, 0, 3)
    cv2.circle(half, (60, 60), 38, 0, 3)
    cv2.ellipse(half, (60, 60), (38, 38), 0, 90, 270, 0, -1)
    assert extract(solid)[0].fill == 1.0
    assert extract(empty)[0].fill == 0.0
    assert extract(half)[0].fill == 0.5


@pytest.mark.parametrize("count", [1, 2, 3, 4, 5])
def test_count_detection(count):
    img = blank_cell()
    spots = [(24, 24), (96, 24), (60, 60), (24, 96), (96, 96)]
    for x, y in spots[:count]:
        cv2.circle(img, (x, y), 12, 0, -1)
    objs = extract(img)
    assert len(objs) == count
    assert all(o.shape == "circle" for o in objs)


def test_empty_cell():
    assert extract(blank_cell()) == []


# ---------------------------------------------------------- end-to-end fixtures

fixtures = sorted(FIXTURES.glob("*.png"))


@pytest.mark.skipif(not fixtures, reason="run `npm run test-data` first")
@pytest.mark.parametrize("path", fixtures, ids=[p.stem for p in fixtures])
def test_fixture_extraction_matches_ground_truth(path):
    r = evaluate(path)
    assert r["ok"], r.get("error")
    assert r["layout"] and r["missing_ok"]
    assert r["count"] == r["cells"]
    assert r["shape"] == r["n"] == r["truth_objects"]
    assert r["fill"] == r["n"]
    assert r["rot"] == r["n"]


def test_analyze_json_contract():
    img = draw_grid(3, 3, (2, 2))
    out = analyze(encode(img))
    assert out["ok"] is True
    assert out["matrix"] == {"rows": 3, "columns": 3}
    assert out["missingCell"] == [2, 2]
    assert out["answerOptions"] == 6
    json.dumps(out)  # serialisable


def test_analyze_reports_region_on_failure():
    img = np.full((600, 800), 255, np.uint8)
    for i in range(3):
        cv2.rectangle(img, (100 + i * 150, 100), (200 + i * 150, 200), 0, 2)
    out = analyze(encode(img))
    assert out["ok"] is False
    assert out["stage"] in ("matrix", "options", "missing_cell")
    assert out["error"]
