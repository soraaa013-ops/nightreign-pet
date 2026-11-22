import type { Session } from '../../contracts/types'
import { getPhase } from '../../core/timeline'
import { time } from '../useDesktop'

/** The same elapsed-time view is used on the desktop and in the control panel. */
export function SessionProgress({
  session,
  detailed = false,
}: {
  session: Session
  detailed?: boolean
}) {
  const phase = getPhase(session.timeline, session.elapsedMs)
  const done = session.status === 'completed'
  const phaseProgress = phase
    ? Math.min(1, Math.max(0, (session.elapsedMs - phase.startMs) / (phase.endMs - phase.startMs)))
    : done
      ? 1
      : 0
  const totalProgress = Math.min(1, Math.max(0, session.elapsedMs / session.timeline.durationMs))
  const phasePercent = Math.floor(phaseProgress * 100)
  const totalPercent = Math.floor(totalProgress * 100)
  const title =
    phase?.kind === 'battle'
      ? phase.day === 3
        ? '夜王战'
        : phase.day === 1
          ? '第一夜 · 首领战'
          : '第二夜 · 首领战'
      : (phase?.label ?? '渡夜完成')
  const progressLabel =
    phase?.kind === 'shrink' ? '缩圈进度' : phase?.kind === 'battle' ? '战斗进度' : '阶段进度'
  const remainingLabel =
    phase?.kind === 'shrink' ? '缩圈剩余' : phase?.kind === 'battle' ? '战斗剩余' : '阶段剩余'
  return (
    <div
      className={`session-progress ${phase?.kind ?? 'complete'}`}
      data-phase={phase?.id ?? 'completed'}
    >
      <div className="progress-heading">
        <strong>{title}</strong>
        {session.status === 'paused' && <span className="paused-label">已暂停</span>}
      </div>
      {!done && phase && (
        <>
          <div className="progress-caption phase-caption">
            <span>
              {remainingLabel} <time>{time(phase.endMs - session.elapsedMs)}</time>
            </span>
            <span className="phase-percent">{phasePercent}%</span>
          </div>
          <div
            className={`progress-track phase-track ${phase.kind === 'battle' ? 'boss-health' : ''}`}
            role="progressbar"
            aria-label={progressLabel}
            aria-valuenow={phasePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${phaseProgress * 100}%` }} />
          </div>
        </>
      )}
      <div className="progress-caption total-caption">
        <span>{done ? '整局完成' : `整局 ${totalPercent}%`}</span>
        <span>
          {done ? '用时' : '剩余'}{' '}
          <time>
            {time(done ? session.elapsedMs : session.timeline.durationMs - session.elapsedMs)}
          </time>
        </span>
      </div>
      <div
        className="progress-track total-track"
        role="progressbar"
        aria-label="整局进度"
        aria-valuenow={totalPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${totalProgress * 100}%` }} />
      </div>
      {detailed && !done && (
        <div className="progress-detail">
          已用 {time(Math.floor(session.elapsedMs / 1000) * 1000)} / 全程{' '}
          {time(session.timeline.durationMs)}
        </div>
      )}
    </div>
  )
}
