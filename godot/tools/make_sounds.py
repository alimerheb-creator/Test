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
write('engine', [(0.6 + 0.4 * math.sin(2 * math.pi * 7.5 * i / R)) * (math.sin(2 * math.pi * 30 * i / R) + 0.6 * math.sin(2 * math.pi * 60 * i / R + 0.5) + 0.35 * math.sin(2 * math.pi * 90 * i / R + 1.1) + 0.2 * math.sin(2 * math.pi * 150 * i / R)) for i in range(int(R * 2.0))])
# the helicopters' rotor: the blades' thump 15 times a second over the turbine's whine; every part repeats within
# the 2 s loop, so it loops without a seam
per = R // 15
burst = lp([random.uniform(-1, 1) for _ in range(per)], 0.06)
rotor = []
for i in range(R * 2):
    j = i % per; t = j / R
    thump = burst[j] * math.exp(-t / 0.02) * (1.0 if (i // per) % 2 == 0 else 0.8) + math.sin(2 * math.pi * 60 * t) * math.exp(-t / 0.025) * 0.5
    rotor.append(thump * 3.0 + 0.05 * math.sin(2 * math.pi * 1350 * i / R) + 0.03 * math.sin(2 * math.pi * 2700 * i / R)
                 + 0.2 * math.sin(2 * math.pi * 30 * i / R) + 0.12 * math.sin(2 * math.pi * 45 * i / R))
write('rotor', rotor)

# Aviation. The start of a loop is blended into its end (from extra made past it), so it loops without a seam.
def seamless(s, f=R // 10):
    n = len(s) - f
    return [s[i] * (i / f) + s[n + i] * (1 - i / f) if i < f else s[i] for i in range(n)]
# a jet's roar: a low rumble and a hiss over the turbine's whine (2 s)
n = R * 2 + R // 10
lo = lp([random.uniform(-1, 1) for _ in range(n)], 0.03)
hi = lp([random.uniform(-1, 1) for _ in range(n)], 0.3)
write('jet', seamless([lo[i] * 3.0 + hi[i] * 0.5 + 0.06 * math.sin(2 * math.pi * 900 * i / R) + 0.04 * math.sin(2 * math.pi * 1800 * i / R) for i in range(n)]))
# a jet's cannon: 50 rounds a second in a half-second loop
per = R // 50
cannon = []
for k in range(25):
    b = lp([random.uniform(-1, 1) for _ in range(per)], 0.45)
    amp = random.uniform(0.8, 1.0)
    for j in range(per):
        t = j / R
        cannon.append(amp * (b[j] * math.exp(-t / 0.004) * 1.4 + math.sin(2 * math.pi * 110 * t) * math.exp(-t / 0.01)))
write('cannon', lp(cannon, 0.6))
# a missile off the rail
n = int(R * 1.6)
wh = lp([random.uniform(-1, 1) for _ in range(n)], 0.25)
write('missile', [wh[i] * min(1, i / (R * 0.03)) * math.exp(-i / (R * 0.7)) for i in range(n)])
# the seeker's tones: a warble while it locks on, steady once locked (1 s loops); the missile warning's beeps (0.5 s)
write('seek', [math.sin(2 * math.pi * 1000 * i / R) * (0.6 + 0.4 * math.sin(2 * math.pi * 8 * i / R)) for i in range(R)])
write('lock', [math.sin(2 * math.pi * 1500 * i / R) + 0.2 * math.sin(2 * math.pi * 3000 * i / R) for i in range(R)])
def beep(i):
    t = (i % (R // 4)) / R
    return math.sin(2 * math.pi * 1100 * i / R) * (min(1, t / 0.005, (0.1 - t) / 0.005) if t < 0.1 else 0.0)
write('warn', [beep(i) for i in range(R // 2)])
# the C-RAM's gatling: 4,500 rounds a minute (75 a second, in a 1 s loop): each a crack over the 75 Hz buzz of the
# barrels, with the drive motor's whine
per = R // 75
cram = []
for k in range(75):
    b = lp([random.uniform(-1, 1) for _ in range(per)], 0.5)
    amp = random.uniform(0.85, 1.0)
    for j in range(per):
        t = j / R
        i = k * per + j
        cram.append(amp * (b[j] * math.exp(-t / 0.0025) * 1.3 + 0.5 * math.exp(-t / 0.004) * math.sin(2 * math.pi * 150 * t))
                    + 0.35 * ((i * 75 / R) % 1.0 - 0.5) + 0.04 * math.sin(2 * math.pi * 1176 * i / R))
write('cram', lp(cram, 0.55))
# an enemy C-RAM tracking you: a slow beep (1 s loop); shooting at you: a fast one (6 a second); and your base's siren,
# wailing up and down every 4 s
def pip(i, period, on, f):
    t = (i % period) / R
    return math.sin(2 * math.pi * f * t) * (min(1, t / 0.004, (on - t) / 0.004) if t < on else 0.0)
write('beep', [pip(i, R, 0.12, 1000) for i in range(R)])
write('beepfast', [pip(i, R // 6, 0.07, 1250) for i in range(R // 2)])
siren = []
for i in range(R * 4):
    t = i / R
    ph = 2 * math.pi * (850 * t + 250 * (4 / (2 * math.pi)) * (1 - math.cos(2 * math.pi * t / 4)))
    siren.append(math.sin(ph) + 0.3 * math.sin(2 * ph) + 0.15 * math.sin(3 * ph))
write('siren', siren)
