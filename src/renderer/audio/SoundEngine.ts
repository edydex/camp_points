import type { ThemeId } from '../../shared'
import { CORE_SOUND_URLS, THEME_ACCENT_URLS, THEME_AMBIENCE_URLS } from './assets'

export type SoundName = 'select' | 'fuel' | 'drain' | 'max' | 'undo' | 'announce' | 'launch' | 'mishap' | 'win'

interface AudioMix {
  master: number
  sfx: number
  ambience: number
  muted: boolean
}

export interface SoundDiagnostics {
  contextState: AudioContextState | 'unavailable'
  loadedAssets: number
  ambiencePlaying: boolean
}

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

const defaultMix: AudioMix = { master: 0.8, sfx: 0.85, ambience: 0.2, muted: false }
const AMBIENCE_HEADROOM = 0.42

const accentLevels: Record<SoundName, number> = {
  select: 0.16,
  fuel: 0.12,
  drain: 0.1,
  max: 0.38,
  undo: 0.12,
  announce: 0.32,
  launch: 0.15,
  mishap: 0.25,
  win: 0.42,
}

/**
 * Plays original WAV samples bundled into the renderer. If a browser cannot
 * load or decode one of those files, the existing Web Audio synthesis path is
 * used for that sound so presentation visuals never depend on media support.
 */
export class SoundEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private mix = defaultMix
  private buffers = new Map<string, AudioBuffer>()
  private loadPromise: Promise<void> | null = null
  private ambienceDesired = false
  private ambienceGeneration = 0
  private ambienceSources = new Map<AudioBufferSourceNode, GainNode>()
  private synthesizedAmbienceGain: GainNode | null = null
  private ambienceOscillators: OscillatorNode[] = []

  async unlock(): Promise<void> {
    if (!this.context) {
      const AudioContextConstructor = globalThis.AudioContext ??
        (typeof window === 'undefined' ? undefined : (window as WebkitWindow).webkitAudioContext)
      if (!AudioContextConstructor) throw new Error('Web Audio is unavailable')
      this.context = new AudioContextConstructor()
      this.master = this.context.createGain()
      this.master.connect(this.context.destination)
      this.updateMaster()
    }
    if (this.context.state === 'suspended') await this.context.resume()
    // Establish the gesture-authorized output path immediately. Decoding every
    // bundled effect plus the music track can take noticeable time on the camp
    // laptop, and must not delay opening the Stage.
    void this.preloadBundledAudio()
    if (this.ambienceDesired && !this.hasActiveAmbience()) {
      void this.ensureAmbiencePlaying(this.ambienceGeneration)
    }
  }

  getDiagnostics(): SoundDiagnostics {
    return {
      contextState: this.context?.state ?? 'unavailable',
      loadedAssets: this.buffers.size,
      ambiencePlaying: this.hasActiveAmbience(),
    }
  }

  setTheme(_theme: ThemeId): void {
    // Kept as a narrow renderer API so callers do not need special cases.
    // Cartoon Sci-Fi is now the only supported runtime theme.
  }

  setMix(patch: Partial<AudioMix>): void {
    this.mix = { ...this.mix, ...patch }
    this.updateMaster()
    this.updateAmbienceGain()
  }

  private updateMaster(): void {
    if (!this.master || !this.context) return
    const value = this.mix.muted ? 0 : this.mix.master
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.015)
  }

  private updateAmbienceGain(): void {
    if (!this.context) return
    const value = this.mix.muted ? 0.0001 : Math.max(0.0001, this.mix.ambience * AMBIENCE_HEADROOM)
    for (const gain of this.ambienceSources.values()) {
      gain.gain.setTargetAtTime(value, this.context.currentTime, 0.3)
    }
    this.synthesizedAmbienceGain?.gain.setTargetAtTime(value, this.context.currentTime, 0.3)
  }

  private async preloadBundledAudio(): Promise<void> {
    if (!this.context) return
    if (this.loadPromise) return this.loadPromise
    const urls = [...new Set([
      ...Object.values(CORE_SOUND_URLS),
      ...Object.values(THEME_ACCENT_URLS),
      ...Object.values(THEME_AMBIENCE_URLS),
    ])]
    this.loadPromise = Promise.all(urls.map(async (url) => {
      try {
        const bytes = await this.loadLocalBytes(url)
        if (!this.context) return
        const buffer = await this.context.decodeAudioData(bytes.slice(0))
        this.buffers.set(url, buffer)
      } catch {
        // A missing/unsupported asset is handled independently by synthesis.
      }
    })).then(() => undefined)
    return this.loadPromise
  }

  private async loadLocalBytes(url: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(url, { cache: 'force-cache' })
      if (!response.ok) throw new Error(`Audio asset returned ${response.status}`)
      return await response.arrayBuffer()
    } catch (fetchError) {
      // Chromium's fetch implementation can reject file:// URLs even though
      // same-directory packaged resources are readable through XHR.
      if (typeof XMLHttpRequest === 'undefined') throw fetchError
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('GET', url, true)
        request.responseType = 'arraybuffer'
        request.onload = () => {
          if (request.response instanceof ArrayBuffer && (request.status === 0 || request.status < 400)) {
            resolve(request.response)
          } else {
            reject(fetchError)
          }
        }
        request.onerror = () => reject(fetchError)
        request.send()
      })
    }
  }

  async play(name: SoundName): Promise<void> {
    await this.unlock()
    if (!this.context || !this.master || this.mix.muted) return
    // Never make a button press wait for asset decoding. The deterministic
    // synthesized effect is an immediate fallback; later presses use the
    // polished bundled sample once preload completes.
    void this.preloadBundledAudio()
    const buffer = this.buffers.get(CORE_SOUND_URLS[name])
    if (!buffer) {
      this.playSynthesized(name)
      return
    }
    this.playBuffer(buffer, this.mix.sfx)
    const accent = this.buffers.get(THEME_ACCENT_URLS.cartoon)
    const accentLevel = accentLevels[name]
    if (accent && accentLevel > 0) this.playBuffer(accent, this.mix.sfx * accentLevel)
  }

  private playBuffer(buffer: AudioBuffer, level: number): void {
    if (!this.context || !this.master) return
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = buffer
    gain.gain.value = Math.max(0, level)
    source.connect(gain).connect(this.master)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  }

  startAmbience(): void {
    if (this.mix.ambience <= 0) return
    this.ambienceDesired = true
    const generation = ++this.ambienceGeneration
    void this.unlock()
      .then(() => this.ensureAmbiencePlaying(generation))
      .catch(() => undefined)
  }

  private async ensureAmbiencePlaying(generation: number): Promise<void> {
    if (!this.context || !this.master || !this.ambienceDesired || generation !== this.ambienceGeneration) return
    if (this.hasActiveAmbience()) return
    await this.preloadBundledAudio()
    if (!this.context || !this.master || !this.ambienceDesired || generation !== this.ambienceGeneration) return
    // unlock() and startAmbience() can both request this generation while the
    // shared preload is pending. Re-check after the await so only the first
    // continuation is allowed to create a looping source.
    if (this.hasActiveAmbience()) return
    const buffer = this.buffers.get(THEME_AMBIENCE_URLS.cartoon)
    if (!buffer) {
      this.startSynthesizedAmbience()
      return
    }
    const gain = this.context.createGain()
    const source = this.context.createBufferSource()
    const now = this.context.currentTime
    source.buffer = buffer
    source.loop = true
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(
      this.mix.muted ? 0.0001 : Math.max(0.0001, this.mix.ambience * AMBIENCE_HEADROOM),
      now + 1.8,
    )
    source.connect(gain).connect(this.master)
    source.onended = () => {
      this.ambienceSources.delete(source)
      source.disconnect()
      gain.disconnect()
    }
    source.start(now)
    this.ambienceSources.set(source, gain)
  }

  stopAmbience(): void {
    this.ambienceDesired = false
    this.ambienceGeneration += 1
    const context = this.context
    const oscillators = this.ambienceOscillators
    const now = context?.currentTime ?? 0
    for (const [source, gain] of this.ambienceSources) {
      if (context) {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(0, now)
      }
      try { source.stop(now) } catch { /* already stopped */ }
      source.disconnect()
      gain.disconnect()
    }
    this.ambienceSources.clear()
    if (this.synthesizedAmbienceGain && context) {
      this.synthesizedAmbienceGain.gain.cancelScheduledValues(now)
      this.synthesizedAmbienceGain.gain.setValueAtTime(0, now)
    }
    for (const oscillator of oscillators) {
      try { oscillator.stop(now) } catch { /* already stopped */ }
      oscillator.disconnect()
    }
    this.synthesizedAmbienceGain?.disconnect()
    this.synthesizedAmbienceGain = null
    this.ambienceOscillators = []
  }

  private hasActiveAmbience(): boolean {
    return this.ambienceSources.size > 0 || this.ambienceOscillators.length > 0
  }

  private playSynthesized(name: SoundName): void {
    if (!this.context || !this.master || this.mix.muted) return
    const now = this.context.currentTime
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.connect(this.master)
    const accent = 1
    const definitions: Record<SoundName, [number, number, OscillatorType, number]> = {
      select: [540, 760, 'sine', 0.13],
      fuel: [240, 620, 'sine', 0.42],
      drain: [420, 150, 'triangle', 0.34],
      max: [520, 1_040, 'sine', 0.7],
      undo: [460, 290, 'triangle', 0.22],
      announce: [330, 660, 'sine', 0.48],
      launch: [95, 360, 'sawtooth', 1.15],
      mishap: [220, 74, 'square', 0.72],
      win: [440, 1_320, 'sine', 1.5],
    }
    const [from, to, type, duration] = definitions[name]
    const oscillator = this.context.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from * accent, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to * accent), now + duration)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, this.mix.sfx * 0.18), now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.03)

    if (name === 'fuel' || name === 'launch' || name === 'mishap') this.playNoise(name, now, duration)
    if (name === 'max' || name === 'win') {
      const harmony = this.context.createOscillator()
      const harmonyGain = this.context.createGain()
      harmony.type = 'sine'
      harmony.frequency.setValueAtTime(from * 1.5 * accent, now + 0.08)
      harmony.frequency.exponentialRampToValueAtTime(to * 1.5 * accent, now + duration)
      harmonyGain.gain.setValueAtTime(0.0001, now)
      harmonyGain.gain.exponentialRampToValueAtTime(this.mix.sfx * 0.11, now + 0.1)
      harmonyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      harmony.connect(harmonyGain).connect(this.master)
      harmony.start(now + 0.06)
      harmony.stop(now + duration + 0.05)
    }
  }

  private startSynthesizedAmbience(): void {
    if (!this.context || !this.master || this.ambienceOscillators.length > 0 || !this.ambienceDesired) return
    const now = this.context.currentTime
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(
      this.mix.muted ? 0.0001 : Math.max(0.0001, this.mix.ambience * 0.1),
      now + 1.8,
    )
    gain.connect(this.master)
    const base = 65.41
    const frequencies = [base, base * 1.5, base * 2]
    this.ambienceOscillators = frequencies.map((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index === 1 ? -7 : index === 2 ? 5 : 0
      const voice = this.context!.createGain()
      voice.gain.value = index === 0 ? 0.55 : index === 1 ? 0.25 : 0.12
      oscillator.connect(voice).connect(gain)
      oscillator.start()
      return oscillator
    })
    this.synthesizedAmbienceGain = gain
  }

  private playNoise(name: 'fuel' | 'launch' | 'mishap', now: number, duration: number): void {
    if (!this.context || !this.master) return
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = name === 'launch' ? 9_173 : name === 'fuel' ? 4_127 : 7_757
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 16_807) % 2_147_483_647
      data[index] = (seed / 1_073_741_823.5 - 1) * (1 - index / data.length)
    }
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    source.buffer = buffer
    filter.type = name === 'launch' ? 'lowpass' : name === 'fuel' ? 'bandpass' : 'highpass'
    filter.frequency.value = name === 'launch' ? 420 : name === 'fuel' ? 900 : 650
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(this.mix.sfx * (name === 'launch' ? 0.2 : 0.08), now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start(now)
  }
}

export const soundEngine = new SoundEngine()
