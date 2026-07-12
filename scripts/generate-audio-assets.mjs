import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 32_000
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = resolve(ROOT, 'src/renderer/audio/assets')
const TAU = Math.PI * 2

const clamp = (value, minimum = -1, maximum = 1) => Math.min(maximum, Math.max(minimum, value))

function seededRandom(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function createTrack(seconds) {
  return new Float64Array(Math.ceil(seconds * SAMPLE_RATE))
}

function envelope(time, duration, attack = 0.01, release = 0.15) {
  const inLevel = attack <= 0 ? 1 : Math.min(1, time / attack)
  const outLevel = release <= 0 ? 1 : Math.min(1, (duration - time) / release)
  return Math.max(0, Math.min(inLevel, outLevel))
}

function waveform(kind, phase) {
  const wrapped = ((phase / TAU) % 1 + 1) % 1
  if (kind === 'triangle') return 1 - 4 * Math.abs(wrapped - 0.5)
  if (kind === 'square') return wrapped < 0.5 ? 1 : -1
  if (kind === 'saw') return 2 * wrapped - 1
  return Math.sin(phase)
}

function addTone(track, {
  start = 0,
  duration,
  from,
  to = from,
  gain = 0.3,
  kind = 'sine',
  attack = 0.008,
  release = 0.12,
  vibrato = 0,
  vibratoRate = 6,
}) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE))
  const count = Math.max(1, Math.floor(duration * SAMPLE_RATE))
  let phase = 0
  for (let index = 0; index < count && first + index < track.length; index += 1) {
    const time = index / SAMPLE_RATE
    const progress = time / duration
    const frequency = from + (to - from) * progress + Math.sin(TAU * vibratoRate * time) * vibrato
    phase += TAU * Math.max(10, frequency) / SAMPLE_RATE
    const fundamental = waveform(kind, phase)
    const softened = kind === 'sine' ? fundamental : fundamental * 0.74 + Math.sin(phase) * 0.26
    track[first + index] += softened * gain * envelope(time, duration, attack, release)
  }
}

function addNoise(track, {
  start = 0,
  duration,
  gain = 0.12,
  attack = 0.01,
  release = 0.18,
  color = 0.14,
  seed = 1,
  tremolo = 0,
}) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE))
  const count = Math.max(1, Math.floor(duration * SAMPLE_RATE))
  const random = seededRandom(seed)
  let low = 0
  let previous = 0
  for (let index = 0; index < count && first + index < track.length; index += 1) {
    const time = index / SAMPLE_RATE
    const white = random() * 2 - 1
    low += color * (white - low)
    const shaped = color < 0 ? white - previous : low
    previous = white
    const pulse = tremolo > 0 ? 0.45 + 0.55 * Math.max(0, Math.sin(TAU * tremolo * time)) : 1
    track[first + index] += shaped * gain * pulse * envelope(time, duration, attack, release)
  }
}

function addChord(track, start, duration, root, ratios, gain, options = {}) {
  ratios.forEach((ratio, index) => addTone(track, {
    start: start + index * (options.stagger ?? 0),
    duration: Math.max(0.08, duration - index * (options.stagger ?? 0)),
    from: root * ratio,
    to: root * ratio * (options.glide ?? 1),
    gain: gain / Math.sqrt(ratios.length),
    kind: options.kind ?? 'sine',
    attack: options.attack ?? 0.015,
    release: options.release ?? 0.2,
    vibrato: options.vibrato ?? 0,
  }))
}

function addDelay(track, delaySeconds, feedback = 0.35) {
  const delay = Math.floor(delaySeconds * SAMPLE_RATE)
  for (let index = delay; index < track.length; index += 1) track[index] += track[index - delay] * feedback
}

function master(track, peak = 0.86) {
  let maximum = 0
  for (const sample of track) maximum = Math.max(maximum, Math.abs(sample))
  const scale = maximum > 0 ? peak / maximum : 1
  const result = new Float32Array(track.length)
  for (let index = 0; index < track.length; index += 1) {
    const sample = Math.tanh(track[index] * scale * 1.18) / Math.tanh(1.18)
    result[index] = clamp(sample * peak)
  }
  return result
}

function wav(samples) {
  const headerBytes = 44
  const output = Buffer.allocUnsafe(headerBytes + samples.length * 2)
  output.write('RIFF', 0)
  output.writeUInt32LE(output.length - 8, 4)
  output.write('WAVE', 8)
  output.write('fmt ', 12)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(SAMPLE_RATE, 24)
  output.writeUInt32LE(SAMPLE_RATE * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36)
  output.writeUInt32LE(samples.length * 2, 40)
  for (let index = 0; index < samples.length; index += 1) {
    output.writeInt16LE(Math.round(clamp(samples[index]) * 32_767), headerBytes + index * 2)
  }
  return output
}

const sfx = {
  select() {
    const track = createTrack(0.22)
    addTone(track, { duration: 0.12, from: 510, to: 790, gain: 0.5, release: 0.07 })
    addTone(track, { start: 0.045, duration: 0.14, from: 1_020, to: 1_270, gain: 0.24, release: 0.1 })
    addNoise(track, { duration: 0.045, gain: 0.12, color: -0.1, release: 0.03, seed: 102 })
    return master(track)
  },
  fuel() {
    const track = createTrack(0.9)
    addTone(track, { duration: 0.82, from: 145, to: 410, gain: 0.34, kind: 'triangle', attack: 0.02, release: 0.18, vibrato: 5 })
    addTone(track, { start: 0.08, duration: 0.7, from: 310, to: 860, gain: 0.24, vibrato: 9, vibratoRate: 10 })
    addNoise(track, { duration: 0.78, gain: 0.18, color: 0.08, release: 0.2, seed: 203, tremolo: 12 })
    ;[0.18, 0.34, 0.51, 0.66].forEach((start, index) => addTone(track, { start, duration: 0.16, from: 660 + index * 55, to: 920 + index * 75, gain: 0.1, release: 0.13 }))
    return master(track)
  },
  drain() {
    const track = createTrack(0.72)
    addTone(track, { duration: 0.62, from: 520, to: 115, gain: 0.42, kind: 'triangle', release: 0.2, vibrato: 4 })
    addTone(track, { start: 0.04, duration: 0.48, from: 890, to: 250, gain: 0.18, release: 0.16 })
    addNoise(track, { start: 0.03, duration: 0.57, gain: 0.2, color: 0.06, release: 0.23, seed: 304 })
    return master(track)
  },
  max() {
    const track = createTrack(1.35)
    ;[523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      addTone(track, { start: index * 0.11, duration: 0.58 + index * 0.09, from: frequency, gain: 0.26, release: 0.33 })
      addTone(track, { start: index * 0.11, duration: 0.46, from: frequency * 2, gain: 0.08, release: 0.28 })
    })
    addChord(track, 0.48, 0.82, 523.25, [1, 1.25, 1.5, 2], 0.42, { attack: 0.04, release: 0.48, stagger: 0.018 })
    addDelay(track, 0.14, 0.22)
    return master(track)
  },
  undo() {
    const track = createTrack(0.48)
    addTone(track, { duration: 0.4, from: 650, to: 250, gain: 0.4, kind: 'triangle', attack: 0.035, release: 0.13 })
    addTone(track, { start: 0.08, duration: 0.25, from: 420, to: 280, gain: 0.2, release: 0.12 })
    addNoise(track, { duration: 0.18, gain: 0.1, color: -0.08, release: 0.14, seed: 405 })
    return master(track)
  },
  announce() {
    const track = createTrack(1.1)
    addChord(track, 0, 0.55, 392, [1, 1.5, 2], 0.34, { release: 0.28, stagger: 0.045 })
    addChord(track, 0.27, 0.76, 523.25, [1, 1.25, 1.5, 2], 0.4, { release: 0.45, stagger: 0.025 })
    addTone(track, { start: 0.16, duration: 0.75, from: 1_800, to: 2_450, gain: 0.055, release: 0.5, vibrato: 11 })
    addDelay(track, 0.18, 0.2)
    return master(track)
  },
  launch() {
    const track = createTrack(2.35)
    addNoise(track, { duration: 2.25, gain: 0.75, color: 0.02, attack: 0.2, release: 0.35, seed: 506, tremolo: 17 })
    addNoise(track, { duration: 2.15, gain: 0.35, color: 0.2, attack: 0.12, release: 0.4, seed: 507 })
    addTone(track, { duration: 2.12, from: 48, to: 104, gain: 0.52, kind: 'saw', attack: 0.18, release: 0.38, vibrato: 4, vibratoRate: 13 })
    addTone(track, { start: 0.12, duration: 1.82, from: 82, to: 245, gain: 0.25, kind: 'triangle', attack: 0.22, release: 0.45 })
    addTone(track, { start: 0.82, duration: 1.18, from: 270, to: 720, gain: 0.1, release: 0.4 })
    return master(track, 0.9)
  },
  mishap() {
    const track = createTrack(1.9)
    ;[0, 0.22, 0.47].forEach((start, index) => {
      addNoise(track, { start, duration: 0.16, gain: 0.34 - index * 0.04, color: 0.03, release: 0.08, seed: 610 + index, tremolo: 22 })
      addTone(track, { start, duration: 0.19, from: 165 - index * 15, to: 98 - index * 8, gain: 0.29, kind: 'square', release: 0.09 })
    })
    addTone(track, { start: 0.68, duration: 0.86, from: 190, to: 64, gain: 0.35, kind: 'triangle', attack: 0.02, release: 0.28, vibrato: 10 })
    addTone(track, { start: 0.82, duration: 0.72, from: 510, to: 130, gain: 0.18, release: 0.3 })
    addTone(track, { start: 1.25, duration: 0.53, from: 230, to: 420, gain: 0.16, kind: 'triangle', release: 0.32 })
    return master(track)
  },
  win() {
    const track = createTrack(3.55)
    const melody = [523.25, 659.25, 783.99, 1_046.5, 783.99, 1_046.5, 1_318.51]
    melody.forEach((frequency, index) => addTone(track, {
      start: index < 4 ? index * 0.24 : 1.1 + (index - 4) * 0.26,
      duration: index === melody.length - 1 ? 1.55 : 0.42,
      from: frequency,
      gain: index === melody.length - 1 ? 0.36 : 0.27,
      kind: 'triangle',
      release: index === melody.length - 1 ? 0.8 : 0.22,
      vibrato: index === melody.length - 1 ? 5 : 0,
    }))
    addChord(track, 0, 1.1, 261.63, [1, 1.25, 1.5, 2], 0.28, { release: 0.35 })
    addChord(track, 1.55, 1.9, 349.23, [1, 1.25, 1.5, 2, 3], 0.5, { attack: 0.05, release: 1.05, stagger: 0.02 })
    addNoise(track, { start: 1.68, duration: 1.5, gain: 0.08, color: -0.06, release: 0.8, seed: 708, tremolo: 18 })
    addDelay(track, 0.19, 0.17)
    return master(track, 0.9)
  },
}

const accents = {
  cartoon() {
    const track = createTrack(0.84)
    addTone(track, { duration: 0.33, from: 190, to: 610, gain: 0.28, kind: 'triangle', attack: 0.008, release: 0.18, vibrato: 13 })
    addTone(track, { start: 0.17, duration: 0.54, from: 830, to: 1_120, gain: 0.24, release: 0.35 })
    addTone(track, { start: 0.23, duration: 0.45, from: 1_245, gain: 0.12, release: 0.32 })
    return master(track, 0.76)
  },
}

await mkdir(OUTPUT, { recursive: true })
const generated = []

for (const [name, build] of Object.entries(sfx)) {
  const filename = `sfx-${name}.wav`
  await writeFile(resolve(OUTPUT, filename), wav(build()))
  generated.push(filename)
}

for (const [theme, build] of Object.entries(accents)) {
  const filename = `accent-${theme}.wav`
  await writeFile(resolve(OUTPUT, filename), wav(build()))
  generated.push(filename)
}

console.log(`Generated ${generated.length} original, offline WAV assets in ${OUTPUT}`)
for (const filename of generated) console.log(`  ${filename}`)
