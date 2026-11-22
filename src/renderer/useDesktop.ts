import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSnapshot, Command, Preferences } from '../contracts/types'
export function useDesktop() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [error, setError] = useState('')
  const [dismissedWarning, setDismissedWarning] = useState<string>()
  const latest = useRef<AppSnapshot | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const accept = useCallback((next: AppSnapshot) => {
    if (!latest.current || next.revision >= latest.current.revision) {
      latest.current = next
      setSnapshot(next)
    }
  }, [])
  useEffect(() => {
    if (!window.nightreign) {
      setError('桌面连接未就绪，请重新打开应用。')
      return
    }
    let active = true
    const off = window.nightreign.onSnapshot((s) => {
      if (active) accept(s)
    })
    window.nightreign
      .getSnapshot()
      .then((s) => {
        if (active) accept(s)
      })
      .catch((e) => setError(String(e.message ?? e)))
    return () => {
      active = false
      off()
    }
  }, [accept])
  const send = useCallback(
    (command: Command): Promise<AppSnapshot> => {
      const task = queue.current
        .catch(() => {})
        .then(() => window.nightreign.command(command))
        .then((next) => {
          accept(next)
          setError('')
          return next
        })
      queue.current = task
      task.catch((e) =>
        setError(
          String(e.message ?? e).replace(/^Error invoking remote method '[^']+': Error: /, ''),
        ),
      )
      return task
    },
    [accept],
  )
  const preferences = useCallback(
    (patch: Partial<Omit<Preferences, 'revision'>>): Promise<AppSnapshot> => {
      const task = queue.current
        .catch(() => {})
        .then(async () => {
          const current = await window.nightreign.getSnapshot()
          return window.nightreign.command({
            type: 'preferences',
            patch,
            expectedRevision: current.preferences.revision,
          })
        })
        .then((next) => {
          accept(next)
          setError('')
          return next
        })
      queue.current = task
      task.catch((e) => setError(String(e.message ?? e)))
      return task
    },
    [accept],
  )
  return {
    snapshot:
      snapshot?.error && snapshot.error === dismissedWarning
        ? { ...snapshot, error: undefined }
        : snapshot,
    send,
    preferences,
    error,
    clearError: () => {
      setError('')
      setDismissedWarning(snapshot?.error)
    },
  }
}
export function time(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
