# Makes the test build's sound effects (16-bit mono WAV) from filtered noise and sine waves.
import math, random, struct, wave, os
R = 22050
random.seed(7)
def write(name, s):
    peak = max(1e-6, max(abs(x) for x in s))
    with wave.open(os.path.join(os.path.dirname(__file__), '..', 'sounds', name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b''.join(struct.pack('<h', int(32000 * x / peak)) for x in s))
def lp(s, a):  # one-pole low-pass
    y, o = 0.0, []
    for x in s: y += a * (x - y); o.append(y)
    return o
def shot(dur, crack, body, tail, f0, cut):
    n = int(R * dur); noise = [random.uniform(-1, 1) for _ in range(n)]
    hi, lo = lp(noise, cut), lp(noise, 0.04)
    out, ph = [], 0.0
    for i in range(n):
        t = i / R
        ph += 2 * math.pi * f0 * (1 - 0.5 * min(1, t / 0.12)) / R
        out.append(hi[i] * crack * math.exp(-t / 0.035) + math.sin(ph) * body * math.exp(-t / 0.07)
                   + lo[i] * tail * math.exp(-t / 0.35) * min(1, t / 0.02))
    return out
def clicks(times, dur, cut=0.5):
    n = int(R * dur); o = [0.0] * n
    for t0 in times:
        b = lp([random.uniform(-1, 1) for _ in range(int(R * 0.04))], cut)
        for j, x in enumerate(b):
            k = int(t0 * R) + j
            if k < n: o[k] += x * math.exp(-j / (R * 0.008))
    return o
write('rifle', shot(1.1, 1.0, 0.9, 1.6, 95, 0.55))
write('smg', shot(0.8, 0.9, 0.6, 1.1, 120, 0.65))
write('pistol', shot(0.9, 1.0, 0.7, 1.2, 140, 0.7))
write('lmg', shot(1.0, 0.9, 1.0, 1.5, 85, 0.5))
write('sniper', shot(1.6, 1.0, 1.1, 2.2, 75, 0.6))
write('boom', lp(shot(2.2, 0.8, 1.4, 3.0, 45, 0.25), 0.3))
write('reload', clicks([0.05, 0.45, 0.5, 1.05], 1.2))
write('empty', clicks([0.0], 0.1, 0.8))
write('step', [x * math.exp(-i / (R * 0.03)) for i, x in enumerate(lp([random.uniform(-1, 1) for _ in range(int(R * 0.12))], 0.12))])
write('hit', [math.sin(2 * math.pi * 1900 * i / R) * math.exp(-i / (R * 0.02)) for i in range(int(R * 0.08))])
write('knife', [x * math.sin(math.pi * i / (R * 0.22)) ** 2 for i, x in enumerate(lp([random.uniform(-1, 1) for _ in range(int(R * 0.22))], 0.35))])
