"""Image preprocessing for screenshots of matrix questions.

Steps: decode -> resize -> grayscale -> contrast normalisation (CLAHE) ->
denoise -> threshold / edges -> optional perspective correction.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class Preprocessed:
    original_shape: tuple[int, int]
    scale: float  # processed = original * scale
    color: np.ndarray
    gray: np.ndarray
    norm: np.ndarray
    binary: np.ndarray  # dark ink -> 255
    edges: np.ndarray
    steps: list[str] = field(default_factory=list)
    perspective: np.ndarray | None = None  # homography applied (processed space)


def decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image (unsupported or corrupt file)")
    return img


def resize(img: np.ndarray, max_dim: int = 2000, min_dim: int = 600) -> tuple[np.ndarray, float]:
    h, w = img.shape[:2]
    scale = 1.0
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
    elif min(h, w) < min_dim:
        scale = min(2.0, min_dim / min(h, w))
    if scale != 1.0:
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=interp)
    return img, scale


def noise_level(gray: np.ndarray) -> float:
    """Rough noise estimate: median absolute deviation of the Laplacian."""
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return float(np.median(np.abs(lap - np.median(lap))))


def find_perspective(binary: np.ndarray) -> np.ndarray | None:
    """Detect a large skewed quadrilateral (e.g. a photographed screen/test area).

    Returns a homography that maps it to an axis-aligned rectangle, or None when
    the image is already axis aligned (the normal case for screenshots).
    """
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = binary.shape
    best = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.15 * w * h:
            continue
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            if best is None or area > cv2.contourArea(best):
                best = approx
    if best is None:
        return None
    pts = best.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    tl, br = pts[np.argmin(s)], pts[np.argmax(s)]
    tr, bl = pts[np.argmin(d)], pts[np.argmax(d)]
    src = np.array([tl, tr, br, bl], dtype=np.float32)
    # Skew angle of the top and left edges
    ang_top = np.degrees(np.arctan2(tr[1] - tl[1], tr[0] - tl[0]))
    ang_left = np.degrees(np.arctan2(bl[0] - tl[0], bl[1] - tl[1]))
    if abs(ang_top) < 1.5 and abs(ang_left) < 1.5:
        return None
    wd = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    ht = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    x0, y0 = float(tl[0]), float(tl[1])
    dst = np.array([[x0, y0], [x0 + wd, y0], [x0 + wd, y0 + ht], [x0, y0 + ht]], dtype=np.float32)
    return cv2.getPerspectiveTransform(src, dst)


def preprocess(data: bytes) -> Preprocessed:
    color = decode(data)
    original_shape = color.shape[:2]
    steps = ["decode"]
    color, scale = resize(color)
    steps.append(f"resize x{scale:.2f}" if scale != 1 else "resize (none needed)")
    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    steps.append("grayscale")
    if noise_level(gray) > 4:
        gray = cv2.fastNlMeansDenoising(gray, None, h=12, templateWindowSize=7, searchWindowSize=15)
        steps.append("denoise (non-local means)")
    else:
        steps.append("denoise (skipped: clean image)")
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    norm = clahe.apply(norm) if float(norm.std()) < 40 else norm
    steps.append("contrast normalisation")
    block = max(15, (min(norm.shape) // 40) | 1)
    binary = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 12)
    steps.append("adaptive threshold")
    edges = cv2.Canny(norm, 50, 150)
    steps.append("edge detection (Canny)")
    H = find_perspective(binary)
    if H is not None:
        size = (norm.shape[1], norm.shape[0])
        color = cv2.warpPerspective(color, H, size, borderValue=(255, 255, 255))
        gray = cv2.warpPerspective(gray, H, size, borderValue=255)
        norm = cv2.warpPerspective(norm, H, size, borderValue=255)
        binary = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 12)
        edges = cv2.Canny(norm, 50, 150)
        steps.append("perspective correction")
    else:
        steps.append("perspective correction (not needed)")
    return Preprocessed(original_shape, scale, color, gray, norm, binary, edges, steps, H)
