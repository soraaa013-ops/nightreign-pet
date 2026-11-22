import type { Phase, Preferences, Session } from '../../contracts/types'
import { getPhase } from '../../core/timeline'
import { time } from '../useDesktop'
import './pet-dial.css'

type Mark = 'explore' | 'shrink' | 'battle' | 'nightlord' | 'paused' | 'completed' | 'idle'

function Glyph({ mark }: { mark: Mark }) {
  switch (mark) {
    case 'explore':
      return (
        <>
          <circle r="2.5" />
          <path d="M0-6v1.7M0 4.3V6M-6 0h1.7M4.3 0H6M-4.3-4.3l1.2 1.2m6.2 6.2 1.2 1.2m0-8.6L3.1-3.1m-6.2 6.2-1.2 1.2" />
        </>
      )
    case 'shrink':
      return (
        <>
          <path d="M-5-2a5.4 5.4 0 0 1 8-2.6L5-3M5 2a5.4 5.4 0 0 1-8 2.6L-5 3M5-6v3H2M-5 6V3h3" />
          <circle r="1" />
        </>
      )
    case 'battle':
      return <path d="M2.9-5.6A5.8 5.8 0 1 0 5.3 3.2 5.7 5.7 0 0 1 2.9-5.6Z" />
    case 'nightlord':
      return <path d="m-6-3 3.3 2L0-5l2.7 4L6-3 4.5 3.5h-9ZM-4 5.5h8" />
    case 'paused':
      return <path strokeWidth="2.6" d="M-2.6-4v8m5.2-8v8" />
    case 'completed':
      return <path d="m-5 0 3.4 3.5L5-4" />
    case 'idle':
      return <path d="m0-6 1.7 4.4L5 0 1.7 1.6 0 6-1.7 1.6-5 0l3.3-1.6Z" />
  }
}

const radius = 84
function point(fraction: number) {
  const angle = fraction * 2 * Math.PI
  return { x: 100 + radius * Math.sin(angle), y: 100 - radius * Math.cos(angle) }
}

function title(phase: Phase | null) {
  if (phase?.kind === 'battle' && phase.day !== 3) return phase.label + ' · 首领战'
  return phase?.label
}

export function PetDial({
  session,
  mode,
  open,
  error,
}: {
  session: Session | null
  mode: Preferences['statusBar']
  open(): void
  error: string
}) {
  if (mode === 'hidden') return null
  const phase = session ? getPhase(session.timeline, session.elapsedMs) : null
  const state = session?.status ?? 'idle'
  const total = session ? Math.min(1, session.elapsedMs / session.timeline.durationMs) : 0
  const local =
    session && phase ? (session.elapsedMs - phase.startMs) / (phase.endMs - phase.startMs) : 0
  const phaseLabel = title(phase) ?? (session ? '渡夜完成' : '等待出击')
  const remainingLabel =
    phase?.kind === 'shrink' ? '缩圈' : phase?.kind === 'battle' ? '战斗' : '阶段'
  const mark: Mark =
    state === 'paused' || state === 'completed' || state === 'idle'
      ? state
      : phase?.id === 'nightlord'
        ? 'nightlord'
        : (phase?.kind ?? 'idle')
  const remaining = session && phase ? time(phase.endMs - session.elapsedMs) : ''
  const description = [
    phaseLabel,
    state === 'paused' ? '已暂停' : '',
    remaining && remainingLabel + '剩余 ' + remaining,
    '点击打开渡夜面板',
  ]
    .filter(Boolean)
    .join(' · ')
  const cursor = point(total)
  return (
    <div
      className="pet-dial"
      data-mode={mode}
      data-state={state}
      data-readout={total >= 0.5 && total < 1 ? 'right' : 'left'}
      data-phase={phase?.id ?? state}
    >
      {session && (
        <progress
          className="dial-accessible-progress"
          aria-label="整局进度"
          max={100}
          value={Math.floor(total * 100)}
          aria-valuenow={Math.floor(total * 100)}
        />
      )}
      {phase && (
        <progress
          className="dial-accessible-progress"
          aria-label={remainingLabel + '进度'}
          max={100}
          value={Math.floor(local * 100)}
          aria-valuenow={Math.floor(local * 100)}
          aria-valuetext={`${phaseLabel}，${remainingLabel}剩余 ${remaining}`}
        />
      )}
      <svg
        aria-hidden="true"
        className="dial-face"
        viewBox="0 0 200 200"
        fill="none"
        focusable="false"
      >
        <g aria-hidden="true">
          <path className="dial-hour" d="M100 11V2" transform="rotate(-50 100 100)" />
          <circle className="dial-outer" cx="100" cy="100" r="88.5" />
          <circle className="dial-bed" cx="100" cy="100" r={radius} />
          {Array.from({ length: 60 }, (_, i) => (
            <path
              key={i}
              className={i % 5 === 0 ? 'dial-hour' : 'dial-minute'}
              d={i % 5 === 0 ? 'M100 8.5v6.3' : 'M100 10.2v1.6'}
              transform={`rotate(${i * 6} 100 100)`}
            />
          ))}
          {session?.timeline.phases.map((p) => {
            const start = p.startMs / session.timeline.durationMs
            const span = (p.endMs - p.startMs) / session.timeline.durationMs
            return (
              <g key={p.id} transform={`rotate(${start * 360} 100 100)`}>
                <circle
                  className={`dial-sector ${p.kind}`}
                  cx="100"
                  cy="100"
                  r={radius}
                  pathLength={100}
                  strokeDasharray={`${span * 100} 100`}
                  transform="rotate(-90 100 100)"
                />
                <path
                  className="dial-boundary"
                  d={p.kind === 'battle' ? 'm97.8 20 2.2-3 2.2 3-2.2 3Z' : 'M100 18.5v2.5'}
                />
              </g>
            )
          })}
        </g>
        <circle
          className="dial-elapsed"
          cx="100"
          cy="100"
          r={radius}
          pathLength={100}
          strokeDasharray={`${total * 100} 100`}
          transform="rotate(-90 100 100)"
        />
        <g className="dial-cursor" transform={`translate(${cursor.x} ${cursor.y})`}>
          <circle className="dial-seal" r="8.3" />
          {phase && (
            <circle
              className="dial-phase"
              r="8.3"
              pathLength={100}
              strokeDasharray={`${local * 100} 100`}
              transform="rotate(-90)"
            />
          )}
          <g className="dial-symbol" aria-hidden="true">
            <Glyph mark={mark} />
          </g>
        </g>
      </svg>
      <button
        className="pet-status dial-winder"
        type="button"
        data-pet-control
        aria-label={description}
        title={description}
        onClick={open}
      >
        <svg viewBox="-10 -10 20 20" aria-hidden="true" focusable="false">
          <path d="M-6.6 0 0-6.6 6.6 0 0 6.6Z M-2.5 0h5M0-2.5v5" />
        </svg>
      </button>
      <div className="dial-readout">
        <strong>{phaseLabel}</strong>
        {state === 'paused' && <span>已暂停</span>}
        {session && phase && (
          <>
            <time className="dial-countdown">{remaining}</time>
            <small>{remainingLabel}剩余</small>
          </>
        )}
        {state === 'completed' && session && <time>用时 {time(session.elapsedMs)}</time>}
        {mode === 'detailed' && session && phase && (
          <small className="dial-detail">
            已用 {time(Math.floor(session.elapsedMs / 1000) * 1000)}
            <br />
            全程 {time(session.timeline.durationMs)}
          </small>
        )}
      </div>
      {error && (
        <small className="dial-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
