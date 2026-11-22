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
    const notes =
      kind === 'victory'
        ? [196, 246.94, 293.66, 392]
        : kind === 'ultimate'
          ? [146.83, 220, 293.66]
          : [220, 293.66]
    notes.forEach((hz, i) => {
      const context = this.context!
      const oscillator = context.createOscillator(),
        gain = context.createGain()
      const start = context.currentTime + i * 0.14
      oscillator.type = 'sine'
      oscillator.frequency.value = hz
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.1, start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8)
      oscillator.connect(gain)
      gain.connect(this.master!)
      this.nodes.add(oscillator)
      oscillator.onended = () => {
        this.nodes.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + 0.9)
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
