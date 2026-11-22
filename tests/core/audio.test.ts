import { afterEach, expect, test, vi } from 'vitest'
import { DEFAULT_PREFERENCES } from '../../src/core/defaults'
import { AudioDirector } from '../../src/renderer/pet/AudioDirector'

afterEach(() => vi.unstubAllGlobals())

function oscillatorNode() {
  return {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function gainNode() {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

test('静音和安静模式阻止音效，恢复后延用音量，释放时关闭音频上下文', () => {
  const contexts: FakeAudioContext[] = []
  class FakeAudioContext {
    state = 'running'
    currentTime = 10
    destination = {}
    close = vi.fn(async () => {})
    resume = vi.fn(async () => {})
    oscillators: ReturnType<typeof oscillatorNode>[] = []
    gains: ReturnType<typeof gainNode>[] = []

    constructor() {
      contexts.push(this)
    }
    createOscillator() {
      const oscillator = oscillatorNode()
      this.oscillators.push(oscillator)
      return oscillator
    }
    createGain() {
      const gain = gainNode()
      this.gains.push(gain)
      return gain
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  const audio = new AudioDirector()
  const preferences = { ...DEFAULT_PREFERENCES, sfxVolume: 63 }
  audio.configure({ ...preferences, muted: true })
  audio.cue('victory')
  audio.configure({ ...preferences, quietMode: true })
  audio.cue('ultimate')
  audio.configure({ ...preferences, sfxVolume: 0 })
  audio.cue('phase')
  expect(contexts).toHaveLength(0)

  audio.configure(preferences)
  audio.cue('phase')
  expect(contexts).toHaveLength(1)
  const [context] = contexts
  expect(context.oscillators.length).toBeGreaterThan(0)
  const initialNotes = context.oscillators.length
  const master = context.gains[0]
  expect(master.gain.value).toBe(0.63)
  expect(master.connect).toHaveBeenCalledWith(context.destination)

  audio.configure({ ...preferences, sfxVolume: 30 })
  expect(master.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0.3)
  expect(context.oscillators).toHaveLength(initialNotes)
  audio.configure({ ...preferences, sfxVolume: 0 })
  expect(master.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0)
  for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenLastCalledWith()

  audio.configure({ ...preferences, quietMode: true })
  audio.cue('victory')
  expect(context.oscillators).toHaveLength(initialNotes)
  audio.configure(preferences)
  audio.cue('phase')
  expect(master.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0.63)
  expect(context.oscillators.length).toBeGreaterThan(initialNotes)

  audio.dispose()
  expect(context.close).toHaveBeenCalledOnce()
})
