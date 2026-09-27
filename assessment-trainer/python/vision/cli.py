"""CLI entry point: reads image bytes from stdin (or a path) and prints JSON.

    python -m vision.cli < screenshot.png
    python -m vision.cli path/to/screenshot.png
    python -m vision.cli --health
"""
from __future__ import annotations

import json
import sys


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--health":
        import cv2
        import numpy

        print(json.dumps({"ok": True, "opencv": cv2.__version__, "numpy": numpy.__version__}))
        return 0
    from .pipeline import analyze

    if args:
        with open(args[0], "rb") as f:
            data = f.read()
    else:
        data = sys.stdin.buffer.read()
    try:
        result = analyze(data)
    except Exception as e:  # never crash without a JSON answer
        result = {"ok": False, "stage": "internal", "error": f"{type(e).__name__}: {e}"}
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
