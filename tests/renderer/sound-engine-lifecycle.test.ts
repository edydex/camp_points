import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SoundEngine } from '../../src/renderer/audio/SoundEngine'

class FakeAudioParam {
  value = 0

  setTargetAtTime(value: number): void { this.value = value }
  setValueAtTime(value: number): void { this.value = value }
  exponentialRampToValueAtTime(value: number): void { this.value = value }
  cancelScheduledValues(): void { /* no-op */ }
}

class FakeGainNode {
  gain = new FakeAudioParam()

  connect(): this { return this }
  disconnect(): void { /* no-op */ }
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null = null
  loop = false
  onended: (() => void) | null = null
  starts = 0
  stops = 0

  connect(): this { return this }
  disconnect(): void { /* no-op */ }
  start(): void { this.starts += 1 }
  stop(): void {
    this.stops += 1
    this.onended?.()
  }
}

const decodedBuffer = {} as AudioBuffer
let decodeResult: Promise<AudioBuffer>
let createdSources: FakeBufferSourceNode[]

class FakeAudioContext {
  state: AudioContextState = 'running'
  currentTime = 12
  destination = {} as AudioDestinationNode

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSourceNode()
    createdSources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  decodeAudioData(): Promise<AudioBuffer> {
    return decodeResult
  }

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }
}

describe('SoundEngine ambience lifecycle', () => {
  beforeEach(() => {
    createdSources = []
    decodeResult = Promise.resolve(decodedBuffer)
    vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps exactly one music loop across repeated start, stop, and restart requests', async () => {
    const engine = new SoundEngine()

    engine.startAmbience()
    await vi.waitFor(() => expect(createdSources).toHaveLength(1))
    expect(createdSources[0].loop).toBe(true)
    expect(engine.getDiagnostics().ambiencePlaying).toBe(true)

    // Both unlock() and startAmbience() request the same pending generation;
    // neither that race nor a repeated click may create another live loop.
    engine.startAmbience()
    await Promise.resolve()
    await Promise.resolve()
    expect(createdSources).toHaveLength(1)

    engine.stopAmbience()
    expect(createdSources[0].stops).toBe(1)
    expect(engine.getDiagnostics().ambiencePlaying).toBe(false)

    engine.startAmbience()
    await vi.waitFor(() => expect(createdSources).toHaveLength(2))
    expect(createdSources[0].stops).toBe(1)
    expect(createdSources[1].starts).toBe(1)
    expect(engine.getDiagnostics().ambiencePlaying).toBe(true)

    engine.stopAmbience()
    expect(createdSources[1].stops).toBe(1)
    expect(engine.getDiagnostics().ambiencePlaying).toBe(false)
  })

  it('does not start stale music after Stop is pressed during asset decoding', async () => {
    let finishDecode!: (buffer: AudioBuffer) => void
    decodeResult = new Promise<AudioBuffer>((resolve) => { finishDecode = resolve })
    const engine = new SoundEngine()

    engine.startAmbience()
    await Promise.resolve()
    engine.stopAmbience()
    finishDecode(decodedBuffer)

    await vi.waitFor(() => expect(engine.getDiagnostics().loadedAssets).toBeGreaterThan(0))
    await Promise.resolve()
    expect(createdSources).toHaveLength(0)
    expect(engine.getDiagnostics().ambiencePlaying).toBe(false)
  })
})
