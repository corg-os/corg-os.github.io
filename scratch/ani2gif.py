"""Converts the Windows 7 animated cursors (.ani) to animated GIFs.

Browsers can't use .ani at all, so the two animated cursors in
`cursor/windows-7/` (Busy, Working In Background) were dead weight. An .ani is
a RIFF container whose `fram` LIST holds one complete .cur per frame, plus a
`rate` chunk giving each frame's duration in jiffies (1/60 s), so the frames
can be pulled out and re-packed as a GIF.

For each .ani this writes, next to the source:
  <slug>.gif         — the animation (Firefox animates GIF cursors; Chrome,
                       Edge and Safari show the first frame only)
  <slug>-frame1.cur  — frame 0 verbatim, as a fallback for browsers that
                       won't take a GIF as a cursor at all

Run from the project root:  python scratch/ani2gif.py
Requires Pillow.
"""

import glob
import io
import os
import struct

from PIL import Image

SRC_GLOB = "cursor/windows-7/*.ani"
TRANSPARENT_INDEX = 255


def parse_ani(path):
    """Returns (frames, rate) — frames are raw .cur byte strings."""
    data = open(path, "rb").read()
    if data[:4] != b"RIFF" or data[8:12] != b"ACON":
        raise ValueError(f"{path}: not an ANI file")

    pos, frames, rate = 12, [], None
    while pos + 8 <= len(data):
        chunk_id = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = pos + 8

        if chunk_id == b"LIST":
            p, end = body + 4, body + size          # skip the list type
            while p + 8 <= end:
                sub_id = data[p:p + 4]
                sub_size = struct.unpack("<I", data[p + 4:p + 8])[0]
                if sub_id == b"icon":
                    frames.append(data[p + 8:p + 8 + sub_size])
                p += 8 + sub_size + (sub_size & 1)  # chunks are word-aligned
        elif chunk_id == b"rate":
            rate = struct.unpack("<%dI" % (size // 4), data[body:body + size])

        pos = body + size + (size & 1)

    if not frames:
        raise ValueError(f"{path}: no icon frames found")
    return frames, rate


def to_gif(frames, rate, out_path):
    images = []
    for raw in frames:
        frame = Image.open(io.BytesIO(raw)).convert("RGBA")
        # GIF only has 1-bit alpha, so cut the soft edge instead of fringing it
        alpha = frame.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        frame.putalpha(alpha)
        indexed = frame.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
        indexed.paste(TRANSPARENT_INDEX, alpha.point(lambda v: 255 if v == 0 else 0))
        images.append(indexed)

    jiffies = rate or [1] * len(frames)
    durations = [max(20, round(j * 1000 / 60)) for j in jiffies]

    images[0].save(out_path, save_all=True, append_images=images[1:], loop=0,
                   duration=durations, transparency=TRANSPARENT_INDEX,
                   disposal=2, optimize=False)
    return durations


def main():
    for path in sorted(glob.glob(SRC_GLOB)):
        frames, rate = parse_ani(path)
        slug = (os.path.basename(path)[:-4]
                .replace("Windows 7 (Vista) ", "")
                .lower().replace(" ", "-"))
        out_dir = os.path.dirname(path)

        gif_path = os.path.join(out_dir, f"{slug}.gif")
        durations = to_gif(frames, rate, gif_path)

        # each frame already *is* a .cur, hotspot included
        with open(os.path.join(out_dir, f"{slug}-frame1.cur"), "wb") as fh:
            fh.write(frames[0])

        hot_x, hot_y = struct.unpack("<HH", frames[0][10:14])
        print(f"{gif_path}: {len(frames)} frames, {durations[0]}ms each, "
              f"hotspot {hot_x},{hot_y}")


if __name__ == "__main__":
    main()
