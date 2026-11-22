import type { DesktopApi, Preferences, AppSnapshot } from '../../contracts/types'

export interface Confirmation {
  title: string
  body: string
  action: string
  run(): void
  save?(): void
}
export interface SessionActions {
  send: DesktopApi['command']
  busy: boolean
  attempt(job: () => Promise<unknown>): void
  confirm(request: Confirmation): void
}
export type PreferencePatch = Partial<Omit<Preferences, 'revision'>>
export interface SettingsProps {
  preferences: Preferences
  update(patch: PreferencePatch): void
  reset(patch: PreferencePatch): void
}
export type SavePreferences = (patch: PreferencePatch) => Promise<AppSnapshot>
