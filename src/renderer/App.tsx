import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Preferences } from '../contracts/types'
import { useDesktop } from './useDesktop'
import { Confirm } from './components/Controls'
import { AudioDirector } from './pet/AudioDirector'
import { PreparePage, useCharacterNotice } from './pages/PreparePage'
import { RhythmPage, usePresetDraft } from './pages/RhythmPage'
import { PetSettings } from './pages/PetSettings'
import { SoundSettings } from './pages/SoundSettings'
import { SystemSettings } from './pages/SystemSettings'
import type { Confirmation } from './pages/types'

type Page = 'prepare' | 'rhythm' | 'pet' | 'sound' | 'system'
const nav: { id: Page; label: string; mark: string }[] = [
  { id: 'prepare', label: '出击准备', mark: '◈' },
  { id: 'rhythm', label: '渡夜节奏', mark: '◷' },
  { id: 'pet', label: '小蜗与桌面', mark: '◇' },
  { id: 'sound', label: '声音与演出', mark: '♫' },
  { id: 'system', label: '操作与运行', mark: '⌘' },
]
const titles: Record<Page, [string, string]> = {
  prepare: ['每一节课，都是一次渡夜。', '让夜雨推进时间，让小蜗陪你走到天明。'],
  rhythm: ['安排你的渡夜', '保留熟悉的缩圈节奏，也为不同的课堂留出余地。'],
  pet: ['给小蜗一个位置', '调整它在桌面上的大小、位置与交互。'],
  sound: ['听见夜色渐浓', '用恰好的声音与演出，感知每一次阶段变化。'],
  system: ['按你的习惯运行', '设定快捷操作，以及暂时离开时的行为。'],
}
export function App() {
  const { snapshot, send, preferences, error, clearError } = useDesktop()
  const [page, setPage] = useState<Page>(
    new URLSearchParams(location.search).get('page') === 'settings' ? 'rhythm' : 'prepare',
  )
  const [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const audio = useRef<AudioDirector | null>(null)
  const [shortcutDraft, setShortcutDraft] = useState<Preferences['shortcuts'] | null>(null)
  const selected =
    snapshot?.presets.find((p) => p.id === snapshot.preferences.selectedPresetId) ??
    snapshot?.presets[0]
  const editor = usePresetDraft(selected)
  const { draft, setDraft, dirty, savedNote, setSavedNote } = editor
  const character = useCharacterNotice()
  useEffect(() => () => audio.current?.dispose(), [])
  useEffect(() => {
    if (snapshot && !shortcutDraft) setShortcutDraft({ ...snapshot.preferences.shortcuts })
  }, [snapshot, shortcutDraft])
  const attempt = (job: () => Promise<unknown>) => {
    setBusy(true)
    job()
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  const pref = (patch: Partial<Omit<Preferences, 'revision'>>) => {
    preferences(patch).catch(() => {})
  }
  const movePage = (next: Page) => {
    if (next === page || confirm) return
    if (page === 'rhythm' && dirty && selected && draft)
      setConfirm({
        title: '放弃未保存的节奏？',
        body: '已保存的预设和当前渡夜不会改变。',
        action: '放弃修改',
        run: () => {
          setDraft(structuredClone(selected))
          setPage(next)
        },
        save: () =>
          attempt(async () => {
            await send({ type: 'savePreset', preset: draft })
            setPage(next)
          }),
      })
    else setPage(next)
  }
  const openRequestedPage = useEffectEvent(() => {
    const request = document.documentElement.dataset.requestedControlPage
    delete document.documentElement.dataset.requestedControlPage
    if (request === 'settings') {
      if (page === 'prepare') movePage('rhythm')
    } else if (request === 'prepare' || request === 'result') movePage('prepare')
  })
  useEffect(() => {
    openRequestedPage()
    window.addEventListener('nightreign:navigate', openRequestedPage)
    return () => window.removeEventListener('nightreign:navigate', openRequestedPage)
  }, [])
  if (!snapshot || !draft || !selected)
    return (
      <div className="boot-screen">
        <span className="sigil">◈</span>
        <h1>小蜗 · 渡夜</h1>
        <p role={error ? 'alert' : 'status'}>{error || '正在准备出击…'}</p>
      </div>
    )
  const p = snapshot.preferences
  const session = snapshot.session
  const active = session?.status === 'running' || session?.status === 'paused'
  const reset = (patch: Partial<Omit<Preferences, 'revision'>>) =>
    setConfirm({
      title: '恢复这一页的默认设置？',
      body: '本页设置将恢复默认值，其他页面保持现有配置。',
      action: '恢复默认',
      run: () => pref(patch),
    })
  const soundTest = () => {
    audio.current ??= new AudioDirector()
    audio.current.configure(p)
    audio.current.cue('phase')
  }
  const actions = { send, busy, attempt, confirm: setConfirm }
  const settings = { preferences: p, update: pref, reset }
  return (
    <div className="app-shell">
      <aside className="sidebar" inert={!!confirm}>
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <strong>小蜗</strong>
            <span>NIGHTREIGN</span>
          </div>
        </div>
        <div className="nav-group-label">你的渡夜</div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'selected' : ''}
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => movePage(n.id)}
            >
              <span aria-hidden="true">{n.mark}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`status-dot ${active ? 'alive' : ''}`} />
          <span>
            {active ? (session?.status === 'paused' ? '渡夜已暂停' : '渡夜进行中') : '等待出击'}
          </span>
          <small>一节课，一次远征。</small>
        </div>
      </aside>
      <main className="main-content" inert={!!confirm}>
        <header className="page-heading">
          <div>
            <span className="eyebrow">{page === 'prepare' ? 'EXPEDITION' : 'PREFERENCES'}</span>
            <h1>{titles[page][0]}</h1>
            <p>{titles[page][1]}</p>
          </div>
          <button
            className="icon-button"
            aria-label={p.muted ? '取消静音' : '静音'}
            title={p.muted ? '取消静音' : '静音'}
            onClick={() => pref({ muted: !p.muted })}
          >
            {p.muted || p.quietMode ? '♩' : '♫'}
          </button>
        </header>
        {(error || snapshot.error) && (
          <div role="alert" className="error-banner">
            <span>{error || snapshot.error}</span>
            <button aria-label="关闭错误提示" onClick={clearError}>
              ×
            </button>
          </div>
        )}
        {page === 'prepare' && (
          <PreparePage
            session={session}
            selected={selected}
            preview={editor.preview}
            character={character}
            actions={actions}
            showDetails={showDetails}
            setShowDetails={setShowDetails}
            openRhythm={() => movePage('rhythm')}
          />
        )}
        {page === 'rhythm' && (
          <RhythmPage
            presets={snapshot.presets}
            selectedId={p.selectedPresetId}
            active={active}
            editor={editor}
            actions={actions}
            update={pref}
          />
        )}
        {page === 'pet' && <PetSettings {...settings} visible={snapshot.petVisible} send={send} />}
        {page === 'sound' && <SoundSettings {...settings} send={send} soundTest={soundTest} />}
        {page === 'system' && (
          <SystemSettings
            {...settings}
            shortcutDraft={shortcutDraft}
            setShortcutDraft={setShortcutDraft}
            savePreferences={preferences}
            savedNote={savedNote}
            setSavedNote={setSavedNote}
          />
        )}
        <footer className="app-footer">
          <span>小蜗 · 课堂渡夜</span>
          <span>本地运行 · 无需账号</span>
        </footer>
      </main>
      {confirm && (
        <Confirm
          onSave={
            confirm.save
              ? () => {
                  confirm.save!()
                  setConfirm(null)
                }
              : undefined
          }
          title={confirm.title}
          action={confirm.action}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run()
            setConfirm(null)
          }}
        >
          {confirm.body}
        </Confirm>
      )}
    </div>
  )
}
