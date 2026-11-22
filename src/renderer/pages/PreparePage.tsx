import { useEffect, useState } from 'react'
import type { Preset, Session, Timeline } from '../../contracts/types'
import { getPhase } from '../../core/timeline'
import { time } from '../useDesktop'
import { PhaseList, TimelineView } from '../components/TimelineView'
import type { SessionActions } from './types'
import { characterManifestUrl } from '../live2d'
import { readManifest } from '../live2d/manifest'

export function useCharacterNotice() {
  const [modelReady, setModelReady] = useState(false)
  const [modelDetails, setModelDetails] = useState('正在检查小蜗资源…')
  useEffect(() => {
    const request = new AbortController()
    readManifest(new URL(characterManifestUrl), request.signal)
      .then(() => {
        if (request.signal.aborted) return
        setModelReady(true)
        setModelDetails('轻点小蜗可以互动，每场战斗可释放一次绝招。')
      })
      .catch(() => {
        if (!request.signal.aborted) setModelDetails('小蜗暂时以立绘陪伴，可以在桌宠旁重试加载。')
      })
    return () => request.abort()
  }, [])
  return { modelReady, modelDetails }
}

interface Props {
  session: Session | null
  selected: Preset
  preview: Timeline | null
  character: ReturnType<typeof useCharacterNotice>
  showDetails: boolean
  setShowDetails(show: boolean): void
  openRhythm(): void
  actions: SessionActions
}

export function PreparePage({
  session,
  selected,
  preview,
  character,
  showDetails,
  setShowDetails,
  openRhythm,
  actions,
}: Props) {
  const { busy, attempt, send, confirm: setConfirm } = actions
  const { modelReady, modelDetails } = character
  const active = session?.status === 'running' || session?.status === 'paused'
  const phase = session ? getPhase(session.timeline, session.elapsedMs) : null
  const timeline = session?.timeline ?? preview
  const remaining = session
    ? Math.max(0, session.timeline.durationMs - session.elapsedMs)
    : (preview?.durationMs ?? 2400000)
  return (
    <>
      <section className={`expedition-card ${active ? 'in-progress' : ''}`}>
        <div className="orbit-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
          <div className="moon" />
          <div className="orbit-label">THE NIGHT APPROACHES</div>
          <img
            className="concept-portrait"
            src="app://assets/character/preview/revenant-portrait.webp"
            alt="复仇者小蜗怀抱竖琴"
          />
        </div>
        <div className="expedition-content">
          <div className="small-label">
            {session?.status === 'completed'
              ? '渡夜成功'
              : active
                ? session.status === 'paused'
                  ? '暂歇片刻'
                  : phase?.label
                : '本次远征'}
          </div>
          {session?.status === 'completed' ? (
            <h2 className="victory-heading">
              NIGHTLORD
              <br />
              SLAIN
            </h2>
          ) : (
            <div className="hero-time">
              {time(remaining)}
              <span>{active ? '剩余时间' : '渡夜时长'}</span>
            </div>
          )}
          <div className="preset-caption">{active ? session.presetName : selected.name}</div>
          <p className="expedition-note">
            {session?.status === 'completed'
              ? `你与小蜗渡过了 ${time(session.timeline.durationMs)}。让这次胜利成为下一次出发的力量。`
              : active
                ? session.pauseReason || '专注眼前，夜雨会为你记录时间。'
                : '探索，收紧的夜雨，以及天明前的最后一战。'}
          </p>
          <div className="hero-actions">
            {active ? (
              <>
                <button
                  className="primary large"
                  disabled={busy}
                  onClick={() =>
                    attempt(() =>
                      send({
                        type: session.status === 'paused' ? 'resume' : 'pause',
                        sessionId: session.id,
                      }),
                    )
                  }
                >
                  {session.status === 'paused' ? '继续渡夜' : '暂停渡夜'}
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    setConfirm({
                      title: '结束本次渡夜？',
                      body: '这次远征将结束，不会播放胜利结算。之后可以重新出击。',
                      action: '结束渡夜',
                      run: () => attempt(() => send({ type: 'abandon', sessionId: session.id })),
                    })
                  }
                >
                  结束本次
                </button>
              </>
            ) : (
              <button
                className="primary large"
                disabled={busy || !preview}
                onClick={() => attempt(() => send({ type: 'start', presetId: selected.id }))}
              >
                <span>{session?.status === 'completed' ? '再次出击' : '出击'}</span>
                <span aria-hidden="true">↗</span>
              </button>
            )}
            {session?.status === 'completed' && (
              <button
                className="text-button"
                onClick={() =>
                  send({ type: 'dismissResult', sessionId: session.id }).catch(() => {})
                }
              >
                收起
              </button>
            )}
          </div>
        </div>
        <div className="card-corner">◈</div>
      </section>
      <div className="route-heading">
        <h2>渡夜路线</h2>
        <button className="text-button" onClick={() => openRhythm()}>
          调整节奏 →
        </button>
      </div>
      <div className="five-stages">
        {timeline &&
          [
            [0, 3, '第一天'],
            [4, 4, '第一夜'],
            [5, 8, '第二天'],
            [9, 9, '第二夜'],
            [10, 10, '夜王战'],
          ].map(([start, end, label]) => (
            <span key={label}>
              {label}{' '}
              <strong>
                {time(timeline.phases[Number(end)].endMs - timeline.phases[Number(start)].startMs)}
              </strong>
            </span>
          ))}
      </div>
      <TimelineView timeline={timeline} current={phase} />
      <div className="route-summary">
        <span>
          <i className="legend explore" />
          探索
        </span>
        <span>
          <i className="legend shrink" />
          夜雨收缩
        </span>
        <span>
          <i className="legend battle" />
          首领战
        </span>
        <button
          className="text-button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '收起' : '完整时间线'} {showDetails ? '−' : '+'}
        </button>
      </div>
      {showDetails && timeline && <PhaseList timeline={timeline} />}
      <div className={`model-notice ${modelReady ? 'ready' : ''}`}>
        <span aria-hidden="true">◇</span>
        <div>
          <strong>{modelReady ? '复仇者 · 小蜗' : '小蜗的桌宠形象'}</strong>
          <p>{modelDetails}</p>
        </div>
        <button
          className="text-button"
          onClick={() => send({ type: 'visibility', visible: true }).catch(() => {})}
        >
          显示桌宠
        </button>
      </div>
    </>
  )
}
