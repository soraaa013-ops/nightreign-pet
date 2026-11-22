import type { Preferences } from '../../contracts/types'
export class AudioDirector {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private preferences: Preferences | null = null
  private nodes = new Set<OscillatorNode>()
  configure(preferences: Preferences) {
    this.preferences = preferences
    if (preferences.muted || preferences.quietMode || preferences.sfxVolume === 0) this.stop()
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(preferences.sfxVolume / 100, this.context.currentTime, 0.015)
  }
  cue(kind: 'phase' | 'ultimate' | 'victory') {
    const p = this.preferences
    if (!p || p.muted || p.quietMode || p.sfxVolume <= 0) return
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.gain.value = p.sfxVolume / 100
      this.master.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') void this.context.resume()
    const march = kind === 'ultimate'
    const notes = march
      ? [146.83, 220]
      : kind === 'victory'
        ? [196, 246.94, 293.66, 392]
        : [220, 293.66]
    notes.forEach((hz, i) => {
      const context = this.context!
      const oscillator = context.createOscillator(),
        gain = context.createGain()
      const start = context.currentTime + (march ? 0 : i * 0.14)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(hz, start)
      gain.gain.setValueAtTime(0, start)
      if (march) {
        // The two March variants release their ground wave at 1.57 s and 1.73 s.
        const release = start + 1.65
        oscillator.frequency.exponentialRampToValueAtTime(hz * 1.06, start + 1.3)
        oscillator.frequency.exponentialRampToValueAtTime(hz * 1.5, release)
        gain.gain.linearRampToValueAtTime(0.017, start + 1.3)
        gain.gain.linearRampToValueAtTime(0.055, release)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.65)
      } else {
        gain.gain.linearRampToValueAtTime(0.1, start + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8)
      }
      oscillator.connect(gain)
      gain.connect(this.master!)
      this.nodes.add(oscillator)
      oscillator.onended = () => {
        this.nodes.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + (march ? 2.7 : 0.9))
    })
  }
  stop() {
    for (const node of this.nodes) {
      try {
        node.stop()
      } catch {
        /* Already ended. */
      }
    }
    this.nodes.clear()
  }
  dispose() {
    this.stop()
    void this.context?.close()
    this.master?.disconnect()
    this.master = null
    this.context = null
  }
}
