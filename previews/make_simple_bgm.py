"""Three sparse, original BGM auditions. Not included in the deployed game."""
import math
import sys
import wave
from array import array
from pathlib import Path

RATE = 22050
DURATION = 16
OUT = Path(__file__).parent


def tone(track, at, midi, duration=0.32, level=0.19, harmonic=0.0):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    for i in range(int(duration * RATE)):
        pos = round(at * RATE) + i
        if pos >= len(track):
            break
        t = i / RATE
        envelope = min(1, t / 0.015) * min(1, (duration - t) / 0.08)
        envelope *= math.exp(-t * 3 / duration)
        phase = 2 * math.pi * frequency * t
        track[pos] += level * envelope * (math.sin(phase) + harmonic * math.sin(2 * phase))


def tap(track, at):
    phase = 0
    for i in range(int(0.15 * RATE)):
        pos = round(at * RATE) + i
        if pos >= len(track):
            break
        t = i / RATE
        phase += 2 * math.pi * (65 + 55 * math.exp(-t * 40)) / RATE
        envelope = min(1, t / 0.008) * math.exp(-t * 30) * min(1, (0.15 - t) / 0.025)
        track[pos] += 0.14 * math.sin(phase) * envelope


def render(name, arrange):
    track = [0.0] * (RATE * DURATION)
    arrange(track)
    # Match average listening levels while leaving comfortable headroom.
    rms = math.sqrt(sum(x * x for x in track) / len(track))
    peak = max(abs(x) for x in track)
    gain = min(0.075 / rms, 0.6 / peak)
    pcm = array('h')
    for i, value in enumerate(track):
        fade = min(1, i / (RATE * 0.02), (len(track) - 1 - i) / (RATE * 0.12))
        pcm.append(round(value * gain * fade * 32767))
    if sys.byteorder != 'little':
        pcm.byteswap()
    path = OUT / name
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    with wave.open(str(path), 'rb') as wav:
        assert wav.getnframes() == RATE * DURATION
    assert peak > 0 and peak * gain < 1
    print(f'{path.name}: {DURATION}s, peak {peak * gain:.2f}, valid PCM WAV')


def two_notes(track):
    # One soft instrument, just C and G. No drums or chords.
    for beat in range(16):
        tone(track, beat, 60 if beat % 2 == 0 else 67, duration=0.75)


def pulse(track):
    # A muted low pulse with a single answering note, every two seconds.
    for beat in range(32):
        tap(track, beat * 0.5)
    for bar in range(8):
        tone(track, bar * 2 + 0.75, 55, duration=0.24, level=0.12)


def three_notes(track):
    # Three notes followed by a full beat of space; no backing instruments.
    for bar in range(8):
        for offset, midi in [(0, 60), (0.5, 64), (1, 67)]:
            tone(track, bar * 2 + offset, midi, duration=0.28, harmonic=0.12)


render('bgm-01-two-notes.wav', two_notes)
render('bgm-02-pulse.wav', pulse)
render('bgm-03-three-notes.wav', three_notes)
