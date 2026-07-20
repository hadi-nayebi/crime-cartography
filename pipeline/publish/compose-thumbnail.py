#!/usr/bin/env python3
"""
compose-thumbnail.py — Crime Cartography thumbnail STANDARD ("theme 1: map + stats").

Builds videos/<slug>/thumbnail.jpg from REAL rendered frames
(videos/<slug>/thumbs/) plus VERIFIED figures read from the city's committed
config. This is the single, reusable thumbnail routine — the "first theme" the
owner asked for: a clean map hero + a few big stats/numbers + short phrases that
tell the viewer what they'll learn.

HONESTY (BINDING): every number and phrase on the thumbnail is copied verbatim
from the city's committed, already-verified config (hook.stat, hook.line,
copy.cityName) or from an explicit, per-city-verified videos/<slug>/thumb.json
spec (safest / busiest neighborhood, year range, kicker). NOTHING is computed,
rounded, or invented here, and the map imagery is a real rendered frame. If a
figure isn't verified in config/spec, it simply isn't drawn.

Layout "theme 1": a dark left panel (city name, hero stat, hook line, optional
safest/busiest chips, tiny source credit) beside a real map frame on the right,
feathered into the panel.

Usage:
  python3 pipeline/publish/compose-thumbnail.py boston-ma
  python3 pipeline/publish/compose-thumbnail.py --all
  python3 pipeline/publish/compose-thumbnail.py boston-ma --frame t290 --preview

thumb.json (optional, per city — ONLY verified figures):
  {
    "frame": "t290",                 # which thumbs/<frame>.jpg is the map hero
    "crop": [300, 88, 952, 548],     # map crop box in the source frame
    "yearRange": "1985 – 2026",      # verified span, shown as a gold sub-line
    "kicker": "40 YEARS · 12 DISTRICTS",
    "busiest": "South End",          # verified busiest neighborhood/region
    "safest": "Charlestown",         # verified safest/quietest neighborhood/region
    "credit": "BPD · Analyze Boston · FBI UCR"
  }
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 1280, 720
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

# ---- colour helpers -------------------------------------------------------


def hex2rgb(h, default=(255, 255, 255)):
    if not h or not isinstance(h, str):
        return default
    h = h.strip().lstrip("#")
    if len(h) == 6:
        try:
            return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))
        except ValueError:
            return default
    return default


def font(path, size):
    return ImageFont.truetype(path, size)


def text_w(draw, s, f, tracking=0):
    if tracking == 0:
        return draw.textlength(s, font=f)
    return sum(draw.textlength(c, font=f) for c in s) + tracking * max(0, len(s) - 1)


def draw_spaced(draw, xy, s, f, fill, tracking=0):
    """Draw text with manual letter-spacing (PIL has none native)."""
    x, y = xy
    for c in s:
        draw.text((x, y), c, font=f, fill=fill)
        x += draw.textlength(c, font=f) + tracking


def fit_font(draw, s, path, start, max_w, min_size=40, tracking=0):
    """Largest font size (<= start) that keeps `s` within max_w."""
    size = start
    while size > min_size:
        f = font(path, size)
        if text_w(draw, s, f, tracking) <= max_w:
            return f
        size -= 4
    return font(path, min_size)


def wrap(draw, s, f, max_w):
    words, lines, cur = s.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ---- map hero -------------------------------------------------------------


def build_map(frame_path, crop, panel_x, panel_w, bg):
    """Crop the real map frame, scale to fit the right panel, feather its left
    edge into the dark panel so text on the left stays clean."""
    src = Image.open(frame_path).convert("RGB")
    if crop:
        src = src.crop(tuple(crop))
    # subtle punch so the map reads at small size
    from PIL import ImageEnhance

    src = ImageEnhance.Brightness(src).enhance(1.07)
    src = ImageEnhance.Contrast(src).enhance(1.10)
    src = ImageEnhance.Color(src).enhance(1.18)

    cw, ch = src.size
    scale = min(panel_w / cw, H / ch)
    nw, nh = int(cw * scale), int(ch * scale)
    src = src.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGB", (panel_w, H), bg)
    ox = (panel_w - nw) // 2
    oy = (H - nh) // 2
    canvas.paste(src, (ox, oy))

    # soft top/bottom vignette so map edges settle into the frame and the
    # small landmark labels don't compete with the headline text
    vig = Image.new("L", (panel_w, H), 0)
    vd = ImageDraw.Draw(vig)
    # top band lighter, bottom band stronger + taller so any baked source/
    # annotation text near the map's lower edge recedes into the frame
    for i in range(90):
        vd.line([(0, i), (panel_w, i)], fill=int(200 * (1 - i / 90)))
    for i in range(150):
        vd.line([(0, H - 1 - i), (panel_w, H - 1 - i)], fill=int(238 * (1 - i / 150)))
    canvas = Image.composite(Image.new("RGB", (panel_w, H), bg), canvas, vig)

    # left-edge feather: alpha ramp 0->255 over the first `feather` px
    feather = 200
    mask = Image.new("L", (panel_w, H), 255)
    md = ImageDraw.Draw(mask)
    for x in range(feather):
        md.line([(x, 0), (x, H)], fill=int(255 * (x / feather)))
    # also a soft bottom vignette for the source credit strip
    return canvas, mask


# ---- main compose ---------------------------------------------------------


def compose(slug, frame_override=None, preview=False):
    vdir = os.path.join(ROOT, "videos", slug)
    cfg_path = os.path.join(vdir, "config.json")
    if not os.path.exists(cfg_path):
        print(f"  skip {slug}: no config.json")
        return False
    cfg = json.load(open(cfg_path))
    spec = {}
    spec_path = os.path.join(vdir, "thumb.json")
    if os.path.exists(spec_path):
        spec = json.load(open(spec_path))

    theme = (cfg.get("theme") or {}).get("colors") or {}
    cats = (cfg.get("theme") or {}).get("catColors") or {}
    bg = hex2rgb(theme.get("bg"), (7, 9, 12))
    ink = hex2rgb(theme.get("ink"), (238, 244, 239))
    dim = hex2rgb(theme.get("inkDim"), (174, 194, 179))
    gold = hex2rgb(cats.get("property"), (233, 180, 76))
    red = hex2rgb(cats.get("persons"), (230, 57, 70))
    green = hex2rgb(cats.get("society"), (79, 191, 139))

    hook = cfg.get("hook") or {}
    stat = str(hook.get("stat") or "").strip()
    line = str(hook.get("line") or "").strip()
    city = str((cfg.get("copy") or {}).get("cityName") or slug).strip()

    frame = frame_override or spec.get("frame") or "t290"
    frame_path = os.path.join(vdir, "thumbs", f"{frame}.jpg")
    if not os.path.exists(frame_path):
        print(f"  skip {slug}: no map frame {frame}.jpg")
        return False

    # canvas
    img = Image.new("RGB", (W, H), bg)
    panel_x = 548  # left dark panel ends here; map hero to its right
    map_canvas, map_mask = build_map(
        frame_path, spec.get("crop", [300, 88, 952, 548]), panel_x, W - panel_x, bg
    )
    img.paste(map_canvas, (panel_x, 0), map_mask)

    # gentle left->right dark gradient over the WHOLE image so the panel edge
    # never has a hard seam and the map's left is grounded in the panel colour
    grad = Image.new("L", (W, 1), 0)
    gp = grad.load()
    for x in range(W):
        if x < panel_x:
            gp[x, 0] = 255
        else:
            t = (x - panel_x) / 260.0
            gp[x, 0] = int(max(0, 255 * (1 - t)))
    grad = grad.resize((W, H))
    img = Image.composite(Image.new("RGB", (W, H), bg), img, grad)

    d = ImageDraw.Draw(img)
    LX = 64  # left text margin
    max_tw = panel_x - LX - 40  # text width budget in the panel

    # 1) kicker (mono, dim, letter-spaced)
    kicker = str(spec.get("kicker") or "REPORTED CRIME · MAPPED").upper()
    kf = font(FONT_MONO, 20)
    draw_spaced(d, (LX, 58), kicker, kf, dim, tracking=3)

    # 2) city name (huge bold)
    cf = fit_font(d, city.upper(), FONT_BOLD, 104, max_tw)
    d.text((LX, 88), city.upper(), font=cf, fill=ink)
    y = 88 + cf.size + 6

    # 3) optional verified year range (gold mono)
    if spec.get("yearRange"):
        yf = font(FONT_MONO, 26)
        draw_spaced(d, (LX + 2, y), str(spec["yearRange"]), yf, gold, tracking=2)
        y += 40

    # 4) hero stat (giant gold) — with a soft glow for legibility over the map
    if stat:
        sy = 250
        sf = fit_font(d, stat, FONT_BOLD, 172, max_tw + 30, min_size=90)
        # glow: draw the stat blurred behind itself
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.text((LX - 2, sy), stat, font=sf, fill=(gold[0], gold[1], gold[2], 150))
        glow = glow.filter(ImageFilter.GaussianBlur(14))
        img.paste(glow, (0, 0), glow)
        d = ImageDraw.Draw(img)
        d.text((LX - 2, sy), stat, font=sf, fill=gold)
        y = sy + sf.size + 4

    # 5) hook line (white, wrapped) — what the number means. Shrink-to-fit so
    # the WHOLE verified phrase shows: largest size that wraps to <=2 lines,
    # else fall back to 3 lines (never truncate the phrase mid-word).
    if line:
        chosen, lines = font(FONT_BOLD, 24), None
        for sz in (30, 28, 26, 24, 22):
            f = font(FONT_BOLD, sz)
            w = wrap(d, line, f, max_tw)
            if len(w) <= 2:
                chosen, lines = f, w
                break
        if lines is None:  # still >2 lines at 22px — allow 3
            chosen = font(FONT_BOLD, 24)
            lines = wrap(d, line, chosen, max_tw)[:3]
        for ln in lines:
            d.text((LX, y), ln, font=chosen, fill=ink)
            y += chosen.size + 8

    # 6) optional verified busiest / safest chips
    def chip(cx, cy, dot, label, value):
        r = 9
        d.ellipse([cx, cy + 12, cx + 2 * r, cy + 12 + 2 * r], fill=dot)
        lf = font(FONT_MONO, 17)
        vf = font(FONT_BOLD, 26)
        d.text((cx + 2 * r + 12, cy + 4), label, font=lf, fill=dim)
        d.text((cx + 2 * r + 12, cy + 26), value, font=vf, fill=ink)

    if spec.get("busiest") or spec.get("safest"):
        chip_y = 588
        if spec.get("busiest"):
            chip(LX, chip_y, red, "BUSIEST", str(spec["busiest"]))
        if spec.get("safest"):
            chip(LX + 250, chip_y, green, "SAFEST", str(spec["safest"]))

    # 7) tiny source credit (honesty, always present)
    credit = str(spec.get("credit") or _short_credit(cfg))
    if credit:
        crf = font(FONT_MONO, 15)
        d.text((LX, H - 34), credit, font=crf, fill=dim)

    out = os.path.join(vdir, "thumbnail.jpg")
    img.convert("RGB").save(out, "JPEG", quality=90)
    print(f"  wrote {out}  ({city}  {stat})")
    return True


def _short_credit(cfg):
    """A short, honest source credit derived from config.sourceLine — first
    clause only, parenthetical (license) dropped, cut at a word boundary so it
    never truncates mid-word."""
    sl = (cfg.get("copy") or {}).get("sourceLine") or ""
    sl = sl.replace("Data:", "").strip()
    for sep in [" · ", " — ", ", "]:
        if sep in sl:
            sl = sl.split(sep)[0].strip()
            break
    if "(" in sl:  # drop a trailing "(public domain)" / "(ODC-PDDL...)"
        sl = sl.split("(")[0].strip()
    if len(sl) > 52:  # cut at last whole word within budget
        sl = sl[:52].rsplit(" ", 1)[0].strip()
    # drop a dangling trailing connector so it never ends on "via the"
    words = sl.split()
    while words and words[-1].lower() in {
        "via", "the", "and", "through", "from", "of", "by", "&", "·", "-",
    }:
        words.pop()
    return " ".join(words)


def main():
    args = sys.argv[1:]
    preview = "--preview" in args
    frame = None
    if "--frame" in args:
        i = args.index("--frame")
        frame = args[i + 1]
        args = args[:i] + args[i + 2 :]
    args = [a for a in args if not a.startswith("--")]

    if "--all" in sys.argv:
        vids = sorted(
            d
            for d in os.listdir(os.path.join(ROOT, "videos"))
            if os.path.isdir(os.path.join(ROOT, "videos", d))
        )
        ok = 0
        for slug in vids:
            if compose(slug, frame, preview):
                ok += 1
        print(f"composed {ok}/{len(vids)} thumbnails")
    elif args:
        compose(args[0], frame, preview)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
