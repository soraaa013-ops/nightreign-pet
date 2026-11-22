export type TimeMode = 'original' | 'classroom' | 'custom'
export type PhaseKind = 'explore' | 'shrink' | 'battle'
export type Status = 'idle' | 'running' | 'paused' | 'completed'
export interface Preset {
  id: string
  name: string
  mode: TimeMode
  battleSeconds: [number, number, number]
  classroomSeconds: number
  customSeconds: number[]
  builtin?: boolean
}
export interface Phase {
  id: string
  label: string
  kind: PhaseKind
  day: 1 | 2 | 3
  startMs: number
  endMs: number
}
export interface Timeline {
  phases: Phase[]
  durationMs: number
}
export interface Preferences {
  revision: number
  selectedPresetId: string
  scale: number
  alwaysOnTop: boolean
  positionLocked: boolean
  clickThrough: boolean
  statusBar: 'hidden' | 'compact' | 'detailed'
  muted: boolean
  quietMode: boolean
  sfxVolume: number
  musicVolume: number
  shrinkAlerts: boolean
  intensity: 'low' | 'standard' | 'high'
  victoryPosition: 'pet' | 'center'
  pauseOnLock: boolean
  autoStart: boolean
  shortcuts: { settings: string; pause: string; visibility: string; clickThrough: string }
}
export interface Session {
  id: string
  status: Exclude<Status, 'idle'>
  presetName: string
  timeline: Timeline
  elapsedMs: number
  /** Preserved when opening saves from releases with per-battle limits. */
  usedUltimates: string[]
  pauseReason?: string
}
export interface AppSnapshot {
  revision: number
  session: Session | null
  preferences: Preferences
  presets: Preset[]
  petVisible: boolean
  error?: string
}
export interface PresentationEvent {
  id: string
  kind: 'phase' | 'ultimate' | 'victory' | 'preview'
  sessionId?: string
  phaseId?: string
  label?: string
}
export type Command =
  | { type: 'start'; presetId: string }
  | { type: 'pause' | 'resume' | 'abandon' | 'dismissResult'; sessionId: string }
  | { type: 'savePreset'; preset: Preset }
  | { type: 'deletePreset'; id: string }
  | { type: 'preferences'; patch: Partial<Omit<Preferences, 'revision'>>; expectedRevision: number }
  | { type: 'openControl'; page?: 'prepare' | 'settings' | 'result' }
  | { type: 'visibility'; visible: boolean }
  | { type: 'resetPosition' | 'contextMenu' | 'quit' | 'preview' | 'ultimate' }
  | { type: 'hitTest'; hit: boolean }
  | { type: 'drag'; dx: number; dy: number; finished?: boolean }
export interface DesktopApi {
  getSnapshot(): Promise<AppSnapshot>
  command(command: Command): Promise<AppSnapshot>
  previewTimeline(preset: Preset): Promise<Timeline>
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void
  onPresentation(listener: (event: PresentationEvent) => void): () => void
}
declare global {
  interface Window {
    nightreign: DesktopApi
  }
}
