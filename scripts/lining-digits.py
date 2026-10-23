"""Builds the lining-figure faces that the Star atlas look uses for digits.

Cormorant Garamond draws its digits old-style unless the "lnum" feature is on, and WebKit
ignores that feature for a text run that is a single character, so a lone "1" came out as a
small capital I in Safari. These faces hold the ten digits only, with the lining glyphs in
place of the old-style ones, so every engine draws the same digits whatever it does with
font features. The tabular variants stay behind the "tnum" feature for the timer.

Run it after changing the fonts (needs fonttools: pip install fonttools):

    python scripts/lining-digits.py

The output goes to src/themes/atlas/fonts. The faces are derived from Cormorant Garamond,
which is licensed under the SIL Open Font License; the licence text sits next to them.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@fontsource" / "cormorant-garamond" / "files"
OUT = ROOT / "src" / "themes" / "atlas" / "fonts"

# The weights and styles the Star atlas look loads (see src/themes/atlas/index.tsx).
FACES = [(500, "normal"), (600, "normal"), (700, "normal"), (500, "italic"), (700, "italic")]
DIGITS = list(range(0x30, 0x3A))


def lining_map(font: TTFont) -> dict[str, str]:
    """Glyph substitutions of the lnum feature: old-style glyph name to lining glyph name."""
    gsub = font["GSUB"].table
    found: dict[str, str] = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "lnum":
            continue
        for index in record.Feature.LookupListIndex:
            for table in gsub.LookupList.Lookup[index].SubTable:
                table = getattr(table, "ExtSubTable", table)
                found.update(table.mapping)
    return found


def build(weight: int, style: str) -> Path:
    source = SRC / f"cormorant-garamond-latin-{weight}-{style}.woff"
    font = TTFont(source)
    cmap = font.getBestCmap()
    lining = lining_map(font)
    for cp in DIGITS:
        name = lining[cmap[cp]]
        for table in font["cmap"].tables:
            if cp in table.cmap:
                table.cmap[cp] = name

    options = subset.Options()
    options.layout_features = ["tnum"]
    options.notdef_outline = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the copyright and licence notes
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=DIGITS)
    subsetter.subset(font)

    font.flavor = "woff"
    target = OUT / f"cormorant-figures-{weight}-{style}.woff"
    font.save(target)
    return target


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for weight, style in FACES:
        target = build(weight, style)
        print(f"{target.relative_to(ROOT)}  {target.stat().st_size} bytes")
