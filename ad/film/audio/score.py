# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Kelvara launch: bespoke minimal-tech score. 120 BPM, 4/4, 20 beats = 10.0 s, A minor.

    MOTION_REEL_SKILL=<skill> uv run kelvara/audio/score.py

b0-4   hook: sine blips arpeggio over a low swelling pad, no drums (the network wakes)
b4-8   machines: soft kick on every beat, tight 16th ticks, a pulsing sub bass
b8-14  the Mini App: full groove, soft clap on 2 and 4, a two-note blip motif on the taps
b14-16 figures: kick drops out, filtered tick roll and a riser into the end card
b16-20 end card: one low kick, an open A minor 9 pad and a long tail

Writes kelvara/audio/music.wav and kelvara/beats.json.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal


def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    found = sorted((Path.home() / ".claude/plugins").glob("**/skills/motion-reel/scripts/dsp.py"))
    if found:
        return found[-1].parent.parent
    sys.exit("set MOTION_REEL_SKILL to the motion-reel skill folder")


sys.path.insert(0, str(_skill_dir() / "scripts"))
from dsp import *  # noqa: E402,F403

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
BPM = 120
BEAT = 60 / BPM
DUR = 10.0
N = int(SR * DUR)
seed(20261126)


def T(b):
    return b * BEAT


def sine_blip(note, length=0.16, bright=0.25):
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.02)
    return x * np.exp(-t / (length * 0.32)) * (1 - np.exp(-t / 0.0015))


def tick(length=0.04, hp=7000):
    n = int(length * SR)
    t = tvec(n)
    return filt(rng.standard_normal(n), "highpass", hp) * np.exp(-t / 0.008)


def soft_clap():
    n = int(0.25 * SR)
    t = tvec(n)
    x = filt(rng.standard_normal(n), "bandpass", (1100, 2400)) * (np.exp(-t / 0.035) + 0.4 * np.exp(-np.maximum(t - 0.012, 0) / 0.02) * (t > 0.012))
    return x * 0.6


def sine_pad(notes, length, attack=0.6, release=0.8):
    n = int(length * SR)
    t = tvec(n)
    L, R = np.zeros(n), np.zeros(n)
    for i, nt in enumerate(notes):
        f = hz(nt)
        for det, pan in ((0.997, 0.25), (1.003, 0.75)):
            x = np.sin(2 * np.pi * f * det * t + rng.uniform() * 6.28) + 0.18 * np.sin(2 * np.pi * 2 * f * det * t)
            L += x * np.sqrt(1 - pan)
            R += x * np.sqrt(pan)
    env = adsr(n, attack, 0.5, 0.85, release)
    return np.stack([L, R]) * env / (len(notes) * 2) ** 0.5


def main():
    drums, bass, music, fx = (Bus(DUR, BPM) for _ in range(4))

    # ---- hook b0-4: blips climbing the A minor 9 arpeggio on 8ths, a low pad swelling under
    arp = ["A4", "C5", "E5", "B5", "A5", "E5", "C6", "B5"]
    for i, nt in enumerate(arp):
        music.add(sine_blip(nt, 0.22), i * 0.5, 0.34, pan=(-0.35 if i % 2 else 0.35))
    music.add(sine_pad(["A2", "E3", "C4"], T(4.2), attack=1.4, release=0.4), 0, 0.42)
    fx.add(riser(T(1)), 3, 0.12)

    # ---- groove b4-14
    for b in range(4, 14):
        drums.add(kick(soft=True), b, 0.95)
    for k in range(4 * 4, 14 * 4):
        b = k / 4
        g = 0.22 if k % 2 else 0.12
        drums.add(tick(0.035 if k % 2 else 0.02), b, g, pan=0.2 if k % 4 == 1 else -0.15)
    for b in (9, 11, 13):
        drums.add(soft_clap(), b, 0.5, pan=0.05)
    bassline = {4: "A1", 6: "A1", 8: "F1", 10: "C2", 12: "G1"}
    for b in np.arange(4, 14, 0.5):
        root = bassline[int(b // 2 * 2)] if int(b // 2 * 2) in bassline else "A1"
        if b % 1 == 0.5:
            bass.add(bass_note(root, 0.22, cutoff=500), b, 0.55)
    chords = {4: ["A3", "C4", "E4", "B4"], 8: ["F3", "A3", "C4", "E4"], 10: ["C4", "E4", "G4", "B4"], 12: ["G3", "B3", "D4", "E4"]}
    for b0, notes in chords.items():
        length = T(4 if b0 == 4 else 2)
        music.add(sine_pad(notes, length + 0.1, attack=0.05, release=0.2), b0, 0.28)
    # blip motif answering the taps in the Mini App (pay @9, approve @10.5, claim @12)
    for b, nt in ((9, "E6"), (9.25, "A6"), (10.5, "C6"), (10.75, "E6"), (12, "B5"), (12.25, "E6"), (13.5, "A6")):
        music.add(sine_blip(nt, 0.18, 0.4), b, 0.22, pan=0.3)
    for b in np.arange(4, 8, 0.5):
        music.add(sine_blip(["A5", "E5", "C6", "E5"][int(b * 2) % 4], 0.12), b, 0.12, pan=-0.3)

    # ---- figures b14-16: drums out, a tick roll and a riser that lands on the end card
    for k in range(14 * 8, 16 * 8):
        b = k / 8
        drums.add(tick(0.02, 5000 + (b - 14) * 2500), b, 0.06 + 0.1 * (b - 14) / 2, pan=(-0.4 if k % 2 else 0.4))
    music.add(sine_pad(["E3", "A3", "B3", "E4"], T(2.1), attack=0.3, release=0.1), 14, 0.3)
    fx.add(riser(T(2)), 14, 0.22)

    # ---- end card b16-20
    drums.add(kick(), 16, 1.0)
    bass.add(sub_drop(1.6, 70, 34), 16, 0.6)
    music.add(sine_pad(["A2", "E3", "B3", "C4", "G4"], T(4.4), attack=0.02, release=1.4), 16, 0.5)
    for b, nt in ((16.5, "E6"), (17, "B5"), (17.5, "A5"), (18.5, "E5")):
        music.add(sine_blip(nt, 0.6, 0.2), b, 0.16, pan=0.2)

    # ---- mix: kick pump, short room, highpass, peak normalise (mix.mjs masters to -14 LUFS)
    kick_t = [T(b) for b in range(4, 14)] + [T(16)]
    pump = sidechain(kick_t, bass.x.shape[1], 0.4, 0.09)
    ir = reverb_ir(1.6, 0.35)
    wet_src = music.x * 0.4 + fx.x * 0.2 + drums.x * 0.05
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    bed = drums.x * 0.9 + bass.x * pump * 0.85 + music.x * pump * 0.8 + fx.x * 0.7 + wet * 0.5
    bed = np.stack([filt(ch, "highpass", 26) for ch in bed])[:, :N]
    bed /= np.abs(bed).max() + 1e-9
    bed *= 0.5
    fade = int(0.35 * SR)
    bed[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    sf.write(HERE / "music.wav", bed.T, SR, subtype="PCM_24")

    # ---- grid: designed at 120 bpm; measured on a click stem of the beat positions so the
    # drum-less hook still anchors the grid
    click = np.zeros(N)
    for b in range(20):
        s = int(T(b) * SR)
        click[s:s + 400] += np.hanning(800)[400:] * np.sign(np.sin(np.arange(400)))
    grid = measure_beats(click, SR, BPM, n_beats=21)
    grid.update({"designed_bpm": BPM, "downbeats": grid["beats"][::4],
                 "sections": {"hook": [0, 4], "machines": [4, 8], "miniapp": [8, 14], "figures": [14, 16], "end": [16, 20]},
                 "source": "kelvara/audio/score.py, synthesized at 120 bpm"})
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"beats: {grid['bpm']} bpm, offset {grid['offset'] * 1000:.1f} ms, period {grid['period']:.4f}")


if __name__ == "__main__":
    main()
