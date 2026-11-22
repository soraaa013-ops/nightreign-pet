import { useEffect, useRef, useState } from 'react'
import type { AppSnapshot } from '../../contracts/types'
import { Live2DAdapter, type Live2DStatus } from '../live2d'
import { useDesktop } from '../useDesktop'
import { SessionProgress } from '../components/SessionProgress'
import { AudioDirector } from './AudioDirector'
import { NightRain } from './NightRain'
import { haloScale, imageHit, type AlphaMask } from './presentation'
export function PetWindow() {
  const { snapshot, send, error } = useDesktop()
  const previewImage = useRef<HTMLImageElement>(null)
  const mask = useRef<AlphaMask | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const model = useRef<Live2DAdapter | null>(null)
  const audio = useRef<AudioDirector | null>(null)
  const latest = useRef<AppSnapshot | null>(null)
  const [modelStatus, setModelStatus] = useState<Live2DStatus>({ state: 'loading' })
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [previewing, setPreviewing] = useState(false)
  const [showModelDetails, setShowModelDetails] = useState(false)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const [banner, setBanner] = useState<{ text: string; victory?: boolean } | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousHit = useRef<boolean | null>(null)
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  latest.current = snapshot
  useEffect(() => {
    if (!canvas.current) return
    const adapter = new Live2DAdapter(canvas.current, { onStatus: setModelStatus })
    model.current = adapter
    audio.current = new AudioDirector()
    void adapter.load()
    const seen = new Set<string>()
    const off = window.nightreign.onPresentation((event) => {
      if (seen.has(event.id)) return
      seen.add(event.id)
      if (seen.size > 100) seen.delete(seen.values().next().value!)
      const s = latest.current
      if (!s) return
      audio.current?.configure(s.preferences)
      if (event.kind === 'ultimate') {
        adapter.play('ultimate')
        audio.current?.cue('ultimate')
        return
      }
      if (event.kind === 'victory') {
        adapter.play('victory')
        audio.current?.cue('victory')
        if (s.preferences.victoryPosition === 'center') return
      }
      if (event.kind === 'phase') {
        setPreviewing(false)
        setBanner(null)
        if (bannerTimer.current) clearTimeout(bannerTimer.current)
        const phase = s.session?.timeline.phases.find((p) => p.id === event.phaseId)
        if (phase?.kind === 'shrink' && !s.preferences.shrinkAlerts) return
        audio.current?.cue('phase')
        // Stage changes remain in the HUD; only victory uses an overlay.
        return
      }
      setPreviewing(event.kind === 'preview')
      if (event.kind === 'preview') {
        adapter.play('touch')
        audio.current?.cue('phase')
      }
      setBanner({
        text: event.kind === 'victory' ? 'NIGHTLORD SLAIN' : (event.label ?? '缩圈效果预览'),
        victory: event.kind === 'victory',
      })
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(
        () => {
          setBanner(null)
          setPreviewing(false)
        },
        event.kind === 'victory' ? 5000 : 3000,
      )
    })
    return () => {
      off()
      adapter.dispose()
      model.current = null
      audio.current?.dispose()
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    }
  }, [])
  useEffect(() => {
    if (!snapshot) return
    audio.current?.configure(snapshot.preferences)
    if (snapshot.session?.status === 'paused') audio.current?.stop()
    model.current?.setVisible(snapshot.petVisible)
    model.current?.setPaused(snapshot.session?.status === 'paused')
    model.current?.setReducedMotion(
      snapshot.preferences.quietMode || snapshot.preferences.intensity === 'low' || reducedMotion,
    )
  }, [snapshot, reducedMotion])
  const session = snapshot?.session
  const phase = session?.timeline.phases.find(
    (p) => session.elapsedMs >= p.startMs && session.elapsedMs < p.endMs,
  )
  useEffect(() => {
    const stages = { night1: 'battle', night2: 'battle2', nightlord: 'nightlord' } as const
    const id = phase?.id
    model.current?.setBaseAction(
      id === 'night1' || id === 'night2' || id === 'nightlord' ? stages[id] : 'idle',
    )
  }, [phase?.id])
  const open = () => send({ type: 'openControl', page: 'prepare' }).catch(() => {})
  const previewHit = (x: number, y: number) =>
    modelStatus.state !== 'ready' && previewImage.current
      ? imageHit(mask.current, previewImage.current.getBoundingClientRect(), x, y)
      : false
  const hit = (x: number, y: number, target: EventTarget | null) =>
    model.current?.hitTest(x, y) ||
    previewHit(x, y) ||
    !!(target as HTMLElement)?.closest?.('[data-pet-control]')
  const hover = (x: number, y: number, target: EventTarget | null) => {
    const next = Boolean(hit(x, y, target))
    if (previousHit.current !== next) {
      previousHit.current = next
      void window.nightreign.command({ type: 'hitTest', hit: next }).catch(() => {})
    }
  }
  const finishDrag = (screenX?: number, screenY?: number) => {
    const current = drag.current
    drag.current = null
    if (!current) return null
    if (
      screenX !== undefined &&
      screenY !== undefined &&
      Math.hypot(screenX - current.startX, screenY - current.startY) > 5
    )
      current.moved = true
    if (current.moved) {
      const dx = (screenX ?? current.x) - current.x,
        dy = (screenY ?? current.y) - current.y
      void window.nightreign.command({ type: 'drag', dx, dy, finished: true }).catch(() => {})
    }
    return current
  }
  const onTouch = () => {
    if (session?.status === 'paused') return
    if (session?.status === 'running' && phase?.kind === 'battle') {
      if (!session.usedUltimates.includes(phase.id))
        void send({ type: 'ultimate', sessionId: session.id, phaseId: phase.id }).catch(() => {})
      return
    }
    model.current?.play('touch')
    if (!session || session.status === 'completed') void open()
  }
  const strength =
    snapshot?.preferences.quietMode || snapshot?.preferences.intensity === 'low'
      ? 0
      : previewing
        ? 0.6
        : phase?.kind === 'shrink'
          ? 0.6
          : phase?.kind === 'battle'
            ? 0.85
            : phase?.day === 2
              ? 0.1
              : 0
  return (
    <div
      className="pet-scene"
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(e) => {
        e.preventDefault()
        send({ type: 'contextMenu' }).catch(() => {})
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) hover(e.clientX, e.clientY, e.target)
        if (d && e.pointerId === d.pointerId) {
          if (Math.hypot(e.screenX - d.startX, e.screenY - d.startY) > 5) d.moved = true
          if (d.moved && !snapshot?.preferences.positionLocked) {
            const dx = e.screenX - d.x,
              dy = e.screenY - d.y
            d.x = e.screenX
            d.y = e.screenY
            if (dx || dy)
              window.nightreign.command({ type: 'drag', dx, dy, finished: false }).catch(() => {})
          }
        }
      }}
      onPointerDown={(e) => {
        if (
          e.button !== 0 ||
          !e.isPrimary ||
          drag.current ||
          (e.target as HTMLElement).closest('[data-pet-control]') ||
          (!model.current?.hitTest(e.clientX, e.clientY) && !previewHit(e.clientX, e.clientY))
        )
          return
        e.preventDefault()
        previousHit.current = true
        void window.nightreign.command({ type: 'hitTest', hit: true }).catch(() => {})
        drag.current = {
          pointerId: e.pointerId,
          x: e.screenX,
          y: e.screenY,
          startX: e.screenX,
          startY: e.screenY,
          moved: false,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        if (drag.current && drag.current.pointerId !== e.pointerId) return
        const d = finishDrag(e.screenX, e.screenY)
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId)
        hover(e.clientX, e.clientY, e.target)
        if (d && !d.moved) onTouch()
      }}
      onLostPointerCapture={(e) => {
        if (drag.current?.pointerId === e.pointerId) finishDrag()
      }}
      onPointerCancel={(e) => {
        if (drag.current?.pointerId !== e.pointerId) return
        finishDrag()
        previousHit.current = null
      }}
      onPointerLeave={() => {
        if (!drag.current) {
          previousHit.current = false
          window.nightreign.command({ type: 'hitTest', hit: false }).catch(() => {})
        }
      }}
    >
      <div
        className="pet-halo"
        aria-hidden="true"
        data-shrinking={phase?.kind === 'shrink' ? 'true' : 'false'}
        style={{ transform: `scale(${haloScale(phase, session?.elapsedMs ?? 0)})` }}
      />
      <canvas ref={canvas} className="pet-model" aria-label="复仇者小蜗 Live2D" />
      <NightRain
        strength={strength * (snapshot?.preferences.intensity === 'high' ? 1.2 : 1)}
        paused={session?.status === 'paused' || reducedMotion}
        visible={snapshot?.petVisible ?? true}
      />
      {modelStatus.state !== 'ready' && (
        <div className="pet-concept">
          <img
            src="app://assets/character/preview/revenant-portrait.webp"
            alt="复仇者小蜗同人立绘预览"
            draggable={false}
            data-pet-character
            ref={previewImage}
            crossOrigin="anonymous"
            onLoad={(e) => {
              const image = e.currentTarget,
                canvas = document.createElement('canvas')
              canvas.width = 256
              canvas.height = Math.round((256 * image.naturalHeight) / image.naturalWidth)
              const context = canvas.getContext('2d', { willReadFrequently: true })
              if (context) {
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                mask.current = {
                  width: canvas.width,
                  height: canvas.height,
                  data: context.getImageData(0, 0, canvas.width, canvas.height).data,
                }
              }
            }}
          />
          <button
            className="concept-label"
            data-pet-control
            title={modelStatus.state === 'error' ? modelStatus.message : '正在检查模型'}
            onClick={open}
          >
            {modelStatus.state === 'loading' ? '小蜗准备中…' : '立绘预览 · 模型未就绪'}
          </button>
          <button
            className="concept-details"
            data-pet-control
            aria-label="查看模型加载详情"
            aria-expanded={showModelDetails}
            onClick={() => setShowModelDetails(!showModelDetails)}
          >
            i
          </button>
          {showModelDetails && (
            <div className="model-details" data-pet-control role="status">
              <strong>模型加载详情</strong>
              <p>{modelStatus.state === 'error' ? modelStatus.message : '正在检查角色模型…'}</p>
              <button onClick={() => setShowModelDetails(false)}>关闭详情</button>
            </div>
          )}
          <button
            className="concept-retry"
            data-pet-control
            aria-label="重新加载小蜗模型"
            title="重新加载小蜗模型"
            onClick={() => void model.current?.load()}
          >
            ↻
          </button>
        </div>
      )}
      {banner && (
        <div className={`pet-stage ${banner.victory ? 'victory' : ''}`}>{banner.text}</div>
      )}
      {session?.status === 'running' &&
        phase?.kind === 'battle' &&
        !session.usedUltimates.includes(phase.id) && (
          <button
            className="pet-ultimate"
            data-pet-control
            onClick={() =>
              send({ type: 'ultimate', sessionId: session.id, phaseId: phase.id }).catch(() => {})
            }
          >
            释放绝招
          </button>
        )}
      {snapshot?.preferences.statusBar !== 'hidden' && (
        <div
          className="pet-status"
          data-pet-control
          role="button"
          tabIndex={0}
          title="打开渡夜面板"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              void open()
            }
          }}
          onClick={open}
        >
          {session ? (
            <SessionProgress
              session={session}
              detailed={snapshot?.preferences.statusBar === 'detailed'}
            />
          ) : (
            <span className="pet-ready">
              等待出击 <span>打开面板 →</span>
            </span>
          )}
          {error && <small role="alert">{error}</small>}
        </div>
      )}
    </div>
  )
}
