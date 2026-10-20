#!/usr/bin/env python3
"""Turn a *real* CLI recording into a terminal demo video and optional GIF.

Dependencies: Pillow and imageio-ffmpeg (``pip install Pillow imageio-ffmpeg``).
No model is run here, and no generated text or performance numbers are invented.

Usage::

    python scripts/render_recording.py docs/assets/chapter-01.json \
      --output docs/assets/chapter-01.mp4 --gif docs/assets/chapter-01.gif

Input: ``{command, model, prompt, events: [{time, text}], result: {...}}``.
``events[].text`` is an incremental streamed fragment and ``time`` is seconds
since generation started. An optional ``event_mode: "cumulative"`` accepts full
text snapshots instead. Recording timestamps determine playback. Long runs are
accelerated to fit; the video explicitly labels the playback speed. Short runs
play at their original speed and hold the completed output for readability.
"""

from __future__ import annotations

import argparse
from bisect import bisect_right
import json
import math
from pathlib import Path
import subprocess
import sys
from typing import Any

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 1280, 720
BG = "#0a1017"
PANEL = "#101a25"
LINE = "#263442"
TEXT = "#dce8ee"
MUTED = "#8399aa"
GREEN = "#71e1b0"


def font(size: int, *, mono: bool = False, bold: bool = False, cjk: bool = False) -> ImageFont.FreeTypeFont:
    """Use fonts present on macOS or Linux, keeping a usable last fallback."""
    if mono:
        candidates = [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/Monaco.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/PingFang.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    if cjk:
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ] + candidates
    for candidate in candidates:
        if Path(candidate).is_file():
            try:
                return ImageFont.truetype(candidate, size=size)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def wrap(text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """Wrap by measured glyph width; preserve line breaks and long tokens."""
    lines: list[str] = []
    for paragraph in text.expandtabs(4).split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            if current and face.getlength(current + char) > width:
                # Prefer a recent word boundary without breaking CJK strings.
                boundary = current.rfind(" ")
                if boundary > len(current) // 2:
                    lines.append(current[:boundary])
                    current = current[boundary + 1 :] + char
                else:
                    lines.append(current)
                    current = char
            else:
                current += char
        lines.append(current)
    return lines


def number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    return None


def read_recording(path: Path) -> tuple[dict[str, Any], list[float], list[str]]:
    recording = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(recording, dict):
        raise ValueError("Recording must be a JSON object.")
    for key in ("command", "model", "prompt"):
        if not isinstance(recording.get(key), str):
            raise ValueError(f"Recording must contain a string '{key}'.")
    if not isinstance(recording.get("result"), dict):
        raise ValueError("Recording must contain a 'result' object.")
    events = recording.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError("Recording must contain at least one real streaming event.")
    timestamps: list[float] = []
    snapshots: list[str] = []
    current = ""
    cumulative = recording.get("event_mode") == "cumulative"
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("Every event must be an object.")
        timestamp = number(event.get("time"))
        fragment = event.get("text")
        if timestamp is None or timestamp < 0 or not isinstance(fragment, str):
            raise ValueError("Every event needs a nonnegative finite time and string text.")
        if timestamps and timestamp < timestamps[-1]:
            raise ValueError("Event timestamps must be in chronological order.")
        current = fragment if cumulative else current + fragment
        timestamps.append(timestamp)
        snapshots.append(current)
    return recording, timestamps, snapshots


class Terminal:
    def __init__(self, recording: dict[str, Any], speed: float, duration: float):
        self.recording = recording
        self.result = recording["result"]
        self.speed = speed
        self.duration = duration
        recorded_text = recording["command"] + recording["prompt"] + "".join(event["text"] for event in recording["events"])
        self.cjk = any("\u2e80" <= char <= "\uffef" for char in recorded_text)
        self.mono = font(23, mono=True, cjk=self.cjk)
        self.small = font(17, mono=True)
        self.label = font(16, bold=True)
        self.metric = font(26, bold=True)
        self.heading = font(43, bold=True)
        self.command_face = font(18, mono=True, cjk=self.cjk)
        command = "$ " + recording["command"]
        self.command_lines = wrap(command, self.command_face, 1096)
        # Keep the exact recorded command visible, even if a long model path
        # requires a smaller font. Never silently substitute a simpler command.
        while len(self.command_lines) > 3 and self.command_face.size > 12:
            self.command_face = font(self.command_face.size - 1, mono=True, cjk=self.cjk)
            self.command_lines = wrap(command, self.command_face, 1096)
        if len(self.command_lines) > 4:
            raise ValueError("Recorded command is too long for a readable video; use a shorter real command.")
        self.output_top = 235 + len(self.command_lines) * (self.command_face.size + 7)
        self.output_bottom = 541
        self.line_height = 32
        self.visible_lines = max(1, (self.output_bottom - self.output_top) // self.line_height)
        self.base = self.make_base()

    def make_base(self) -> Image.Image:
        img = Image.new("RGB", (WIDTH, HEIGHT), BG)
        d = ImageDraw.Draw(img)
        d.text((55, 28), "BUILD DEEPINFER", font=self.label, fill=GREEN)
        d.text((55, 57), "One token at a time.", font=self.heading, fill=TEXT)
        model = self.recording["model"].rstrip("/").split("/")[-1]
        device = str(self.recording.get("device", self.result.get("device", "CPU"))).upper()
        d.text((1225, 35), f"CHAPTER 01  /  {device}", font=self.small, fill=MUTED, anchor="ra")
        model_lines = wrap(model, self.small, 430)
        d.text((1225, 74), model_lines[-1], font=self.small, fill=TEXT, anchor="ra")

        d.rounded_rectangle((54, 130, 1226, 670), radius=17, fill=PANEL, outline=LINE, width=1)
        for x, color in ((79, "#f17f7b"), (102, "#e9bd6b"), (125, "#71c795")):
            d.ellipse((x - 5, 153, x + 5, 163), fill=color)
        d.text((152, 148), "terminal · actual local run", font=self.small, fill=MUTED)
        playback = f"Playback {self.speed:.2f}× (accelerated)" if self.speed > 1.001 else "Real-time playback"
        d.text((1200, 148), playback, font=self.small, fill=GREEN, anchor="ra")
        d.line((55, 182, 1225, 182), fill=LINE)
        y = 204
        for line in self.command_lines:
            d.text((80, y), line, font=self.command_face, fill=GREEN)
            y += self.command_face.size + 7
        d.text((80, self.output_top - 24), "GENERATED TEXT", font=font(12, bold=True), fill=MUTED)
        d.line((80, 571, 1200, 571), fill=LINE)
        d.text((55, 690), "Source + walkthrough: Build DeepInfer · Chapter 01", font=font(13), fill=MUTED)
        return img

    def frame(self, text: str, elapsed: float, *, complete: bool, frame_number: int, fps: int) -> Image.Image:
        img = self.base.copy()
        d = ImageDraw.Draw(img)
        lines = wrap(text, self.mono, 1096)
        if len(lines) > self.visible_lines:
            lines = lines[-self.visible_lines :]
        for index, line in enumerate(lines):
            d.text((80, self.output_top + index * self.line_height), line, font=self.mono, fill=TEXT)
        if not complete and (frame_number // max(1, fps // 2)) % 2 == 0:
            x = 80 + self.mono.getlength(lines[-1])
            y = self.output_top + (len(lines) - 1) * self.line_height + 4
            d.rectangle((x + 3, y, x + 13, y + 24), fill=GREEN)

        if complete:
            fields = [
                ("PROMPT / GENERATED", self.token_count()),
                ("PREFILL", self.seconds("prefill_seconds")),
                ("DECODE", self.seconds("decode_seconds")),
                ("GENERATION THROUGHPUT", self.rate()),
            ]
            for x, (label, value) in zip((80, 369, 658, 947), fields):
                d.text((x, 587), label, font=font(11, bold=True), fill=MUTED)
                d.text((x, 610), value, font=self.metric, fill=TEXT)
        else:
            status = "Decoding" if text else "Prefill"
            d.text((80, 603), status, font=self.metric, fill=TEXT)
            d.text((1200, 609), f"Recorded elapsed {elapsed:.2f} s", font=self.small, fill=MUTED, anchor="ra")
        fraction = min(1.0, elapsed / self.duration) if self.duration else 1.0
        d.line((73, 668, 73 + 1134 * fraction, 668), fill=GREEN, width=3)
        return img

    def token_count(self) -> str:
        prompt = self.result.get("prompt_tokens")
        generated = self.result.get("generated_tokens")
        if isinstance(prompt, int) and isinstance(generated, int):
            return f"{prompt} / {generated} tokens"
        return "Not recorded"

    def seconds(self, key: str) -> str:
        value = number(self.result.get(key))
        return f"{value:.2f} s" if value is not None else "Not recorded"

    def rate(self) -> str:
        value = number(self.result.get("tokens_per_second"))
        return f"{value:.1f} tok/s" if value is not None else "Not recorded"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--output", type=Path, default=Path("docs/assets/chapter-01.mp4"))
    parser.add_argument("--gif", type=Path, help="Also make a compact 768 px / 8 fps GIF.")
    parser.add_argument("--seconds", type=float, default=20.0, help="Target demo duration (default: 20); never slows a real run.")
    parser.add_argument("--fps", type=int, default=24)
    args = parser.parse_args()
    if not 5 <= args.seconds <= 120 or not 1 <= args.fps <= 60:
        parser.error("--seconds must be 5–120 and --fps must be 1–60.")
    try:
        import imageio_ffmpeg
    except ImportError:
        parser.error("Install the demo dependencies: pip install Pillow imageio-ffmpeg")

    recording, timestamps, snapshots = read_recording(args.recording)
    recorded_total = number(recording["result"].get("total_seconds"))
    duration = max(timestamps[-1], recorded_total or 0.0)
    end_hold = min(5.0, args.seconds / 3)
    active_budget = args.seconds - end_hold
    speed = max(1.0, duration / active_budget)
    active_seconds = duration / speed
    playback_seconds = max(min(15.0, args.seconds), active_seconds + end_hold)
    frame_count = math.ceil(playback_seconds * args.fps)
    terminal = Terminal(recording, speed, duration)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    writer = imageio_ffmpeg.write_frames(
        str(args.output), (WIDTH, HEIGHT), fps=args.fps,
        codec="libx264", pix_fmt_in="rgb24", pix_fmt_out="yuv420p",
        quality=8, macro_block_size=16,
        output_params=["-movflags", "+faststart", "-preset", "medium"],
        ffmpeg_log_level="error",
    )
    writer.send(None)
    try:
        for index in range(frame_count):
            elapsed = min(duration, (index / args.fps) * speed)
            event_index = bisect_right(timestamps, elapsed) - 1
            text = snapshots[event_index] if event_index >= 0 else ""
            complete = index / args.fps >= active_seconds
            frame = terminal.frame(text, elapsed, complete=complete, frame_number=index, fps=args.fps)
            writer.send(frame.tobytes())
    finally:
        writer.close()
    print(f"Video: {args.output} ({playback_seconds:.1f} s; recorded run {duration:.2f} s; {speed:.2f}× playback)")

    if args.gif:
        args.gif.parent.mkdir(parents=True, exist_ok=True)
        filters = (
            "fps=8,scale=768:-1:flags=lanczos,split[a][b];"
            "[a]palettegen=stats_mode=diff[p];"
            "[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle"
        )
        subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
             "-i", str(args.output), "-filter_complex", filters, "-loop", "0", str(args.gif)],
            check=True,
        )
        print(f"GIF: {args.gif}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"render_recording: {error}", file=sys.stderr)
        sys.exit(1)
