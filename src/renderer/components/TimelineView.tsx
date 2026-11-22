import type { Phase, Timeline } from '../../contracts/types'
import { time } from '../useDesktop'

export function TimelineView({
  timeline,
  current,
}: {
  timeline?: Timeline | null
  current?: Phase | null
}) {
  if (!timeline) return null
  return (
    <div className="timeline" aria-label="完整渡夜时间线">
      {timeline.phases.map((p, i) => (
        <div
          className={`timeline-segment ${p.kind} ${p.id === current?.id ? 'current' : ''}`}
          style={{ flexGrow: p.endMs - p.startMs }}
          key={p.id}
          title={`${p.label} ${time(p.endMs - p.startMs)}`}
        >
          <span className="timeline-number">
            {i === 0
              ? 'DAY 1'
              : i === 5
                ? 'DAY 2'
                : p.kind === 'battle'
                  ? i === 10
                    ? '夜王'
                    : i === 4
                      ? '第一夜'
                      : '第二夜'
                  : ''}
          </span>
          <i />
          <span className="timeline-duration">
            {p.kind === 'battle' || i === 0 || i === 5 ? time(p.endMs - p.startMs) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PhaseList({ timeline }: { timeline: Timeline }) {
  return (
    <ol className="phase-list">
      {timeline.phases.map((x) => (
        <li key={x.id}>
          <span>{time(x.startMs)}</span>
          <strong>{x.label}</strong>
          <span>{time(x.endMs - x.startMs)}</span>
        </li>
      ))}
    </ol>
  )
}
