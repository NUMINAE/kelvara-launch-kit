# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Kelvara launch: bespoke minimal-tech score. 120 BPM, 4/4, 72 beats = 36.0 s, A minor.

    MOTION_REEL_SKILL=<skill> uv run kelvara/audio/score.py

Beats here are real beats. HOLDS (mirrors film.js) maps the film's own beats onto them.
b0-12     hook: sine blips climbing an A minor 9 arpeggio over a swelling pad, no drums
b12-19.5  machines: soft kick on every beat, 16th ticks, sub bass on the offbeats
b19.5-58.5 the Mini App: the groove continues, claps on 2 and 4, a blip answering every tap
b58.5-65.5 figures: drums out, a tick roll and a riser into the end card
b65.5-72 end card: one low kick, an open A minor 9 pad and a long tail

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
DUR = 36.0
HOLDS = [[0, 0], [6, 2.9], [10, 3.75], [12, 5], [19.5, 12.5], [20.5, 12.95], [23.5, 13.05], [24.7, 13.6], [26, 14.25],
         [30, 14.8], [31.4, 15.4], [34.8, 15.65], [36.2, 16.25], [38, 16.55], [38.6, 16.75], [42, 17.05], [43.4, 17.7],
         [45.8, 17.8], [47.2, 18.45], [49.6, 18.55], [51, 19.15], [52.6, 19.45], [53.2, 19.7], [57.2, 21.15], [58.5, 21.75], [61.5, 23.25], [64.5, 24.4], [65.5, 25], [70.5, 30]]


def FAST(f):
    """film beat -> real beat"""
    for (r0, f0), (r1, f1) in zip(HOLDS, HOLDS[1:]):
        if f <= f1:
            return r0 + (f - f0) / (f1 - f0) * (r1 - r0)
    return HOLDS[-1][0] + f - HOLDS[-1][1]
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

    # ---- hook b0-12: one blip per beat climbing the A minor 9 arpeggio, a low pad swelling under
    arp = ["A4", "C5", "E5", "B5", "A5", "E5", "C6", "B5", "A5", "E5", "C6", "E6"]
    for i, nt in enumerate(arp):
        music.add(sine_blip(nt, 0.32), i, 0.32, pan=(-0.35 if i % 2 else 0.35))
    music.add(sine_pad(["A2", "E3", "C4"], T(12.3), attack=3.0, release=0.5), 0, 0.42)
    music.add(sine_pad(["A3", "C4", "E4", "B4"], T(4), attack=1.2, release=0.3), 6, 0.18)   # under the held headline
    fx.add(riser(T(2)), 10, 0.14)

    # ---- groove b12-58.5
    G0, G1 = 12, 58.5
    for b in range(G0, int(G1)):
        drums.add(kick(soft=True), b, 0.95)
    for k in range(G0 * 4, int(G1 * 4) - 1):
        b = k / 4
        drums.add(tick(0.035 if k % 2 else 0.02), b, 0.22 if k % 2 else 0.12, pan=0.2 if k % 4 == 1 else -0.15)
    for b in range(21, int(G1), 2):
        drums.add(soft_clap(), b, 0.5, pan=0.05)
    prog8 = [("A1", ["A3", "C4", "E4", "B4"]), ("F1", ["F3", "A3", "C4", "E4"]), ("C2", ["C4", "E4", "G4", "B4"]), ("G1", ["G3", "B3", "D4", "E4"])]
    for b0 in range(G0, int(G1), 4):
        root, notes = prog8[(b0 - G0) // 4 % 4]
        music.add(sine_pad(notes, min(T(4), T(G1 - b0)) + 0.1, attack=0.05, release=0.25), b0, 0.26)
        for b in np.arange(b0 + 0.5, min(b0 + 4, G1), 1.0):
            bass.add(bass_note(root, 0.22, cutoff=500), b, 0.55)
    for b in np.arange(G0, 19.5, 0.5):   # the machines' own pulse
        music.add(sine_blip(["A5", "E5", "C6", "E5"][int(b * 2) % 4], 0.12), b, 0.12, pan=-0.3)
    # blips answering the phone: chat tap, pay, approve, allocated, claim now, claim, approve, claimed
    for f, nt in ((13.5, "E6"), (15.25, "C6"), (16.1, "E6"), (16.7, "A6"), (17.5, "B5"), (18.25, "C6"), (19.0, "E6"), (19.6, "A6")):
        music.add(sine_blip(nt, 0.22, 0.4), FAST(f), 0.22, pan=0.3)

    # ---- figures b58.5-65.5: drums out, a tick roll and a riser that lands on the end card
    F0, F1 = 58.5, 65.5
    for k in range(int(F0 * 8), int(F1 * 8)):
        b = k / 8
        drums.add(tick(0.02, 5000 + (b - F0) / (F1 - F0) * 5000), b, 0.06 + 0.1 * (b - F0) / (F1 - F0), pan=(-0.4 if k % 2 else 0.4))
    music.add(sine_pad(["E3", "A3", "B3", "E4"], T(F1 - F0 + 0.1), attack=0.3, release=0.1), F0, 0.3)
    fx.add(riser(T(2)), F1 - 2, 0.22)

    # ---- end card b65.5-72
    drums.add(kick(), F1, 1.0)
    bass.add(sub_drop(1.8, 70, 34), F1, 0.6)
    music.add(sine_pad(["A2", "E3", "B3", "C4", "G4"], T(72 - F1), attack=0.02, release=1.6), F1, 0.5)
    for d, nt in ((0.5, "E6"), (1, "B5"), (1.5, "A5"), (2.5, "E5"), (3.5, "B4")):
        music.add(sine_blip(nt, 0.7, 0.2), F1 + d, 0.16, pan=0.2)

    # ---- mix: kick pump, short room, highpass, peak normalise (mix.mjs masters to -14 LUFS)
    kick_t = [T(b) for b in range(G0, int(G1))] + [T(F1)]
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
    for b in range(72):
        s = int(T(b) * SR)
        click[s:s + 400] += np.hanning(800)[400:] * np.sign(np.sin(np.arange(400)))
    grid = measure_beats(click, SR, BPM, n_beats=73)
    grid.update({"designed_bpm": BPM, "downbeats": grid["beats"][::4],
                 "sections": {"hook": [0, 12], "machines": [12, 19.5], "miniapp": [19.5, 58.5], "figures": [58.5, 65.5], "end": [65.5, 72]},
                 "source": "kelvara/audio/score.py, synthesized at 120 bpm"})
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"beats: {grid['bpm']} bpm, offset {grid['offset'] * 1000:.1f} ms, period {grid['period']:.4f}")


if __name__ == "__main__":
    main()
