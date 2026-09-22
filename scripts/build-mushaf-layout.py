#!/usr/bin/env python3
"""Build the Madinah mushaf page layout (604 pages x 15 lines) for Dugsi.

Source: the King Fahd Glorious Qur'an Printing Complex's Word document of the
Hafs mushaf ("UthmanicHafs v22.docx"), which is typeset line for line like the
printed mushaf: every <w:br/> is a line break of the printed page and every
page break is a page break of the printed page. A public copy lives in
https://github.com/mustafa0x/qpc-fonts (text-mushafs/UthmanicHafs_V22/).

The document's words are matched, character by character, against Dugsi's own
Quran corpus (lib/quran/data, locked by SHA-256 in CI) so the layout refers to
Dugsi's word indexes and the displayed text never changes.

Usage:  python3 scripts/build-mushaf-layout.py "/path/to/UthmanicHafs v22.docx"

Output: lib/quran/layout/index.json and lib/quran/layout/pages-N.json (50 pages each)

Line encoding (see lib/quran/layout.ts):
  ["h", surah]                      surah name banner
  ["b"]                             basmala
  [[s, a, w0, w1, m], ...]          words w0..w1-1 of ayah s:a; m=1 when the
                                    ayah marker sits at the end of this segment
"""
import difflib, html, json, re, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "lib" / "quran" / "data"
OUT = ROOT / "lib" / "quran" / "layout"
PAGES_PER_FILE = 50
DIGITS = "٠١٢٣٤٥٦٧٨٩"
TATWEEL = "ـ"


def read_docx_pages(path: Path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    body = xml[xml.index("<w:body>"):]
    tok = re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>|<w:br/>|<w:br [^>]*w:type="page"[^>]*/>|</w:p>', re.S)
    pages = [[]]
    cur = ""
    for m in tok.finditer(body):
        s = m.group(0)
        if s.startswith("<w:t"):
            cur += html.unescape(m.group(1))
        elif s == "<w:br/>" or s == "</w:p>":
            pages[-1].append(cur)
            cur = ""
        else:  # page break
            if cur.strip():
                pages[-1].append(cur)
                cur = ""
            pages.append([])
    if cur.strip():
        pages[-1].append(cur)
    return [[l for l in p if l.strip()] for p in pages]


def load_corpus():
    """Dugsi's words per ayah: {surah: [[w, ...], ...]}."""
    corpus = {}
    fat = (ROOT / "lib" / "quran" / "fatiha.ts").read_text(encoding="utf-8")
    # Al-Fatiha is hand-tagged in TypeScript; one `number: n` block per ayah.
    blocks = re.split(r"number:\s*(\d+)", fat[fat.index("ayat: ["):])[1:]
    corpus[1] = []
    for i in range(0, len(blocks), 2):
        corpus[1].append(re.findall(r'uthmani:\s*"([^"]+)"', blocks[i + 1]))
    for s in range(2, 115):
        d = json.loads((DATA / f"{s}.json").read_text(encoding="utf-8"))
        corpus[s] = [v["text"].split() for v in d["verses"]]
    return corpus


def norm(t: str) -> str:
    return t.replace(TATWEEL, "")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    pages = read_docx_pages(Path(sys.argv[1]))
    assert len(pages) == 604, len(pages)
    corpus = load_corpus()

    # 1. Classify lines and build the token stream with (page, line) positions.
    basm = pages[0][1].replace("\xa0", " ").split()[:4]
    layout = [[] for _ in pages]  # per page: list of lines (filled below)
    stream = []  # (page_index, line_index, token)
    surah_no = 0
    for pi, p in enumerate(pages):
        after_header = None
        for li, line in enumerate(p):
            toks = line.replace("\xa0", " ").split()
            if line.startswith("سُورَةُ"):
                surah_no += 1
                layout[pi].append(["h", surah_no])
                after_header = surah_no
                continue
            if after_header not in (None, 1, 9) and len(toks) == 4:
                # the basmala line (two copies in the source carry a stray shadda)
                assert [re.sub(r"[ً-ْ]", "", t) for t in toks] == [re.sub(r"[ً-ْ]", "", t) for t in basm], (pi, line)
                layout[pi].append(["b"])
                after_header = None
                continue
            after_header = None
            layout[pi].append([])  # text line, segments added later
            for t in toks:
                stream.append((pi, len(layout[pi]) - 1, t))
    assert surah_no == 114

    # 2. Walk ayah by ayah, aligning the document's words with Dugsi's words.
    i = 0
    fuzzy = 0
    for s in range(1, 115):
        for a, mine in enumerate(corpus[s], start=1):
            theirs = []
            while i < len(stream) and not all(c in DIGITS for c in stream[i][2]):
                theirs.append(stream[i])
                i += 1
            marker = stream[i]
            i += 1
            # Character spans of every token in the normalised concatenations.
            t_text, t_spans = "", []
            for tok in theirs:
                n = norm(tok[2])
                t_spans.append((len(t_text), len(t_text) + len(n), tok))
                t_text += n
            m_text, m_spans = "", []
            for w in mine:
                n = norm(w)
                m_spans.append((len(m_text), len(m_text) + len(n)))
                m_text += n
            if m_text == t_text:
                mapping = lambda p: p  # noqa: E731
            else:
                fuzzy += 1
                sm = difflib.SequenceMatcher(None, m_text, t_text, autojunk=False)
                blocks = sm.get_matching_blocks()

                def mapping(p, blocks=blocks):
                    best = 0
                    for b in blocks:
                        if b.a <= p < b.a + b.size:
                            return b.b + (p - b.a)
                        if b.a <= p:
                            best = b.b + b.size - 1
                    return max(0, best)

            def line_of(pos):
                for st, en, tok in t_spans:
                    if st <= pos < en:
                        return tok[0], tok[1]
                return t_spans[-1][2][0], t_spans[-1][2][1]

            # Assign each of Dugsi's words to a page/line, then group into segments.
            prev = None
            for w, (st, en) in enumerate(m_spans):
                pl = line_of(mapping(st))
                if pl != prev:
                    layout[pl[0]][pl[1]].append([s, a, w, w + 1, 0])
                    prev = pl
                else:
                    layout[pl[0]][pl[1]][-1][3] = w + 1
            mp, ml = marker[0], marker[1]
            if prev == (mp, ml):
                layout[mp][ml][-1][4] = 1
            else:  # marker alone at the start of the next line
                layout[mp][ml].append([s, a, len(mine), len(mine), 1])
    assert i == len(stream), (i, len(stream))

    # 3. Validate: every word exactly once, in order, 15 lines a page.
    expect = [(s, a, w) for s in range(1, 115) for a, ws in enumerate(corpus[s], 1) for w in range(len(ws))]
    seen = []
    markers = 0
    for pi, p in enumerate(layout):
        assert len(p) == (8 if pi < 2 else 15), (pi + 1, len(p))
        for line in p:
            if line and line[0] in ("h", "b"):
                continue
            for s, a, w0, w1, m in line:
                seen.extend((s, a, w) for w in range(w0, w1))
                markers += m
    assert seen == expect, "word coverage mismatch"
    assert markers == 6236, markers

    # 4. Write chunks + index.
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("pages-*.json"):
        old.unlink()
    starts, surah_page = [], {}
    for pi, p in enumerate(layout):
        first = None
        for line in p:
            if line and line[0] == "h":
                surah_page.setdefault(line[1], pi + 1)
            elif line and line[0] != "b" and first is None:
                first = [line[0][0], line[0][1]]
        starts.append(first)
    for c in range(0, 604, PAGES_PER_FILE):
        chunk = layout[c : c + PAGES_PER_FILE]
        (OUT / f"pages-{c // PAGES_PER_FILE + 1}.json").write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "index.json").write_text(
        json.dumps({"pagesPerFile": PAGES_PER_FILE, "starts": starts, "surahPage": [surah_page[s] for s in range(1, 115)]}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"ok: 604 pages, {sum(len(p) for p in layout)} lines, {fuzzy} ayat aligned fuzzily")


if __name__ == "__main__":
    main()
