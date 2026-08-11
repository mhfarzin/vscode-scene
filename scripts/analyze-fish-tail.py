#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analyze-fish-tail.py
================================================================================
A helper script for the **vscode-scene** extension's Aquarium screen.

It automatically measures the "tail neck" of a fish sprite PNG so you can add a
NEW fish sprite and get its animated-wagging tail working with zero guessing.

--------------------------------------------------------------------------------
WHAT IS THE "TAIL NECK"?
--------------------------------------------------------------------------------
The Aquarium screen (`src/webview/screens/AquariumScreen.ts`) animates each
fish's tail by splitting the sprite in half at a vertical cut line:

                            neck (cut line)
                                │
              ┌─────────────────┼──────────┐
              │                 │          │
              │      BODY       │   TAIL   │
              │   (0..neckX)    │ (neckX..)│
              │                 │          │
              └─────────────────┼──────────┘
                                │
                 Fish swims LEFT  →  head/snout is on the LEFT

The cut line must go exactly through the *narrowest* column of the fish's body
(the spot where the body connects to the tail fin). At render time the tail is
drawn separately and rotated around that neck point with a sine wave, which is
what produces the "wagging tail" animation.

We measure the neck as FRACTIONS of the sprite width/height (0.0 - 1.0), so the
same measurement works no matter what resolution the PNG is.

--------------------------------------------------------------------------------
HOW TO USE (ADD A NEW FISH)
--------------------------------------------------------------------------------
1. Drop your new fish sprite into:
       assets/screens/aquarium/fish-N.png
   (where N is the next number, e.g. 7 if you already have fish-1..fish-6)

2. Run the analyzer on that file:
       python scripts/analyze-fish-tail.py assets/screens/aquarium/fish-7.png

3. Read the console output. It will print the exact fraction values, e.g.:
       fish-7.png: neckX=0.733 (0.733 of width)  neckY=0.541 (0.541 of height)

4. (Optional) Look at the generated debug image  neck_debug_fish-7.png  to
   visually confirm the red cut line lands on the narrowest part of the body.

5. Open  src/webview/screens/AquariumScreen.ts  and add an entry to the
   TAIL_NECKS map:
       const TAIL_NECKS: Record<number, { x: number; y: number }> = {
           ...
           7: { x: 0.733, y: 0.541 },
       };

6. Bump FISH_IMAGE_COUNT so the loader picks up the new sprite:
       const FISH_IMAGE_COUNT = 7;

7. Rebuild and test:
       npm run compile
   Open the extension / run  test.html?screen=aquarium  to see the new fish
   swimming around with an animated tail.

The existing 6 fish are already measured and their values live in TAIL_NECKS;
you do NOT need to re-run this script for them unless you replace the artwork.

--------------------------------------------------------------------------------
WHAT THE SCRIPT DOES
--------------------------------------------------------------------------------
* Loads the PNG with Pillow.
* Builds a "column-height profile": for each x column it counts how many
  non-transparent pixels the fish occupies in that column.
* Scans the right ~half of the image for the local minimum of that profile
  (the narrowest column where the tail connects to the body).
* Returns the neck position as fractions (x = col / width, y = midpoint of the
  column's vertical span / height).
* Optionally writes a debug image with the cut line drawn in red.
================================================================================
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from typing import Optional, Tuple

# Pillow is needed to read PNGs. It is a dev-only dependency; the extension
# itself does not use Python at all — this script just helps us create assets.
try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit(
        "\n[ERROR] Pillow is not installed.\n"
        "Install it with:\n"
        "    pip install pillow\n"
        "or\n"
        "    python -m pip install pillow\n"
    )


# ----------------------------------------------------------------------------
# Measurement logic
# ----------------------------------------------------------------------------

@dataclass
class NeckResult:
    """The measured tail-neck position, in several useful forms."""

    sprite_name: str
    width: int
    height: int
    neck_px_x: int          # column index where the cut line goes (px)
    neck_px_y: int          # vertical center of that column (px)
    neck_frac_x: float      # neck_px_x / width   → paste into TAIL_NECKS
    neck_frac_y: float      # neck_px_y / height  → paste into TAIL_NECKS
    neck_height: int        # height of the column (debug info)

    def __post_init__(self) -> None:
        # Round the fractions to 3 decimals — same precision as existing data.
        self.neck_frac_x = round(self.neck_frac_x, 3)
        self.neck_frac_y = round(self.neck_frac_y, 3)


def column_alpha(alpha) -> list[int]:
    """
    Return, for each x column, the number of pixels whose alpha is > threshold.
    `alpha` is a Pillow image channel (mode 'L').
    The threshold removes anti-aliased fringe so we look at the visible body.
    """
    threshold = 40
    width, height = alpha.size
    alpha_px = alpha.load()
    heights: list[int] = []
    for x in range(width):
        count = 0
        for y in range(height):
            if alpha_px[x, y] > threshold:
                count += 1
        heights.append(count)
    return heights


def find_neck(heights: list[int]) -> Tuple[int, int]:
    """
    Find the TRUE tail neck (where the body narrows into the tail fin).

    A naive "minimum column" search returns the very tip of the tail fin,
    which is WRONG. Instead we look for the valley pattern:

        body height ..............._
                                  |   <- narrow "neck" (valley)
                                  |_.._  <- tail fin opens back up (fans out)

    Algorithm:
    * Only consider the right half (~40% onward): fish heads point LEFT and
      the tail fin is on the RIGHT, so the neck is always in the right half.
    * Scan from left to right for the FIRST column whose height drops below
      30% of the sprite's maximum height (the "neck"). A 45% threshold was
      too shallow — it caught shallow dips on the tail fin itself (e.g.
      fish-1 at x≈0.71), so we require a DEEP valley (≤30% of max).
    * Inside the dip, find the very bottom (the narrowest column).
    * Verify the tail actually fans back out afterwards: any column within the
      next ~35px must be at least TWICE the dip's own height. This
      distinguishes a real neck (which is followed by the tail fin) from the
      tapered tail tip. (A fixed 60%-of-max threshold fails here because the
      tail fins of the built-in sprites only re-open to ~40-50% of max.)
    * If no such valley exists (e.g. a fish whose tail simply tapers to a
      point with no fan — like fish-4), fall back to the LAST column that
      still has at least 40% of the max height. This lands on the shoulder
      of the body where the tail starts.

    Returns (neck_x_px, neck_height).
    """
    if not heights:
        return (0, 0)

    width = len(heights)
    max_height = max(heights)
    start_x = int(width * 0.40)          # ignore the head/first part

    # 1) Try the valley-with-regrowth pattern (the common case).
    for x in range(start_x, width - 5):
        if heights[x] < 0.30 * max_height:
            # Find the bottom of the dip.
            dip_x = x
            dip_h = heights[x]
            for xx in range(x, min(width, x + 30)):
                if heights[xx] < dip_h:
                    dip_h = heights[xx]
                    dip_x = xx
            # The tail fin must open back up AFTER the dip (>= 2x the dip).
            regrown = any(
                heights[xx] >= 2.0 * dip_h
                for xx in range(dip_x + 1, min(width, dip_x + 35))
            )
            if regrown:
                # Reject results that sit in the last ~10% of the image —
                # that far right is just the tail tip, not the neck.
                if dip_x > 0.90 * width:
                    break
                return (dip_x, dip_h)

    # 2) Fallback: the "shoulder" — where the tall body ends.
    #    Scan left→right and take the LAST column whose height is still at
    #    least 50% of the sprite's maximum. After that point the body clearly
    #    narrows into the tail. This handles tapered tails (e.g. fish-4)
    #    that have no fan-out.
    shoulder_x = start_x
    for x in range(start_x, width):
        if heights[x] >= 0.50 * max_height:
            shoulder_x = x
    return (shoulder_x, heights[shoulder_x])


def measure_neck(path: str) -> Optional[NeckResult]:
    """Run the full measurement on a PNG file and return a NeckResult."""
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    alpha = img.getchannel("A")

    heights = column_alpha(alpha)
    neck_x, neck_h = find_neck(heights)

    # vertical center of the neck column
    span = [
        y for y in range(height) if alpha.getpixel((neck_x, y)) > 40
    ]
    neck_y = int((min(span) + max(span)) / 2) if span else height // 2

    return NeckResult(
        sprite_name=os.path.basename(path),
        width=width,
        height=height,
        neck_px_x=neck_x,
        neck_px_y=neck_y,
        neck_frac_x=neck_x / width,
        neck_frac_y=neck_y / height,
        neck_height=neck_h,
    )


# ----------------------------------------------------------------------------
# Debug image
# ----------------------------------------------------------------------------

def write_debug_image(path: str, result: NeckResult, out: str) -> None:
    """
    Write a preview PNG that shows :
      * the red vertical cut line at the detected neck column
      * a red dot at the neck hinge point
      * faint column-height bars along the bottom edge

    This is purely visual — open it to sanity-check that the neck is at the
    narrowest part of the body.
    """
    img = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Column-height profile bars (scaled to the image height).
    heights = column_alpha(img.getchannel("A"))
    if heights:
        max_h = max(heights) or 1
        for x, h in enumerate(heights):
            bar_h = int((h / max_h) * (img.height * 0.20))
            if bar_h > 0:
                draw.line(
                    [(x, img.height - 1), (x, img.height - 1 - bar_h)],
                    fill=(0, 255, 255, 120),
                )

    # Red cut line + hinge dot.
    draw.line(
        [(result.neck_px_x, 0), (result.neck_px_x, img.height - 1)],
        fill=(255, 0, 0, 220),
        width=2,
    )
    r = 6
    draw.ellipse(
        [
            result.neck_px_x - r,
            result.neck_px_y - r,
            result.neck_px_x + r,
            result.neck_px_y + r,
        ],
        fill=(255, 0, 0, 255),
    )

    img.save(out)
    print(f"  Debug image written to: {out}")


# ----------------------------------------------------------------------------
# Report
# ----------------------------------------------------------------------------

def format_report(result: NeckResult, action: str) -> str:
    """Build the human-readable report shown to the user."""
    lines = []
    lines.append("=" * 72)
    lines.append(f"  {result.sprite_name}  ({result.width}x{result.height} px)")
    lines.append("=" * 72)
    lines.append(f"  Neck column (px):  x={result.neck_px_x}, y={result.neck_px_y}  "
                 f"(column height = {result.neck_height}px)")
    lines.append(f"  Neck fractions:    x={result.neck_frac_x}, y={result.neck_frac_y}")
    lines.append("")
    lines.append("  Copy this into src/webview/screens/AquariumScreen.ts:")
    lines.append(f"      {result.neck_frac_x}, {result.neck_frac_y}")
    lines.append("")
    lines.append("  Add with 3 decimals, e.g. inside TAIL_NECKS:")
    lines.append(f"      {result.sprite_name.replace('fish-','').replace('.png','')}: "
                 f"{{ x: {result.neck_frac_x}, y: {result.neck_frac_y} }},")
    lines.append("=" * 72)

    if action == "add":
        lines.append("")
        lines.append("  → Add a new fish: 5 manual steps")
        lines.append("    1. Copy this measurement into TAIL_NECKS in AquariumScreen.ts.")
        lines.append("    2. Bump FISH_IMAGE_COUNT (e.g. 6 → 7).")
        lines.append("    3. Make sure the file is named fish-7.png in assets/screens/aquarium/.")
        lines.append("    4. npm run compile")
        lines.append("    5. Open test.html?screen=aquarium to verify the tail wags.")
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Measure the tail-neck position of a fish sprite PNG "
                    "for the vscode-scene Aquarium screen.",
        epilog="Example:\n"
               "  python scripts/analyze-fish-tail.py assets/screens/aquarium/fish-7.png\n"
               "  python scripts/analyze-fish-tail.py assets/screens/aquarium/fish-7.png --debug\n"
               "  python scripts/analyze-fish-tail.py --all\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("path", nargs="?", help="Path to a fish PNG file to analyze.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Analyze every fish-N.png currently in assets/screens/aquarium/ "
             "and print all their TAIL_NECKS entries at once.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Also write a debug preview image (neck_debug_<name>.png) with "
             "the cut line drawn, so you can visually verify the neck.",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    aquarium_dir = os.path.join("assets", "screens", "aquarium")

    # If --all, gather every fish-N.png in the aquarium folder.
    if args.all:
        files = sorted(
            f for f in os.listdir(aquarium_dir)
            if f.startswith("fish-") and f.endswith(".png")
        )
        if not files:
            print(f"No fish-*.png found in {aquarium_dir}")
            return 1
        results = [measure_neck(os.path.join(aquarium_dir, f)) for f in files]
        results = [r for r in results if r is not None]

        print("Found {} fish sprite(s) → printing all TAIL_NECKS entries:\n".format(len(results)))
        for r in results:
            print(f"    {r.sprite_name}: x={r.neck_frac_x}, y={r.neck_frac_y}   "
                  f"({r.width}x{r.height}px)")
            if args.debug:
                write_debug_image(
                    os.path.join(aquarium_dir, r.sprite_name), r,
                    f"neck_debug_{r.sprite_name}",
                )
        return 0

    # Single-file mode.
    if not args.path:
        build_parser().print_help()
        return 1

    if not os.path.isfile(args.path):
        print(f"[ERROR] File not found: {args.path}")
        print("Run without arguments to see usage, or use --all to scan the aquarium folder.")
        return 1

    result = measure_neck(args.path)
    if result is None:
        print(f"[ERROR] Could not measure {args.path} — is it a valid image?")
        return 1

    print(format_report(result, "add"))

    if args.debug:
        out_name = f"neck_debug_{result.sprite_name}"
        write_debug_image(args.path, result, out_name)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
