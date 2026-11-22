import { useEffect, useState } from 'react'
import type { Preset, Timeline } from '../../contracts/types'
import { time } from '../useDesktop'
import { Panel } from '../components/Controls'
import { PhaseList, TimelineView } from '../components/TimelineView'
import type { SessionActions, PreferencePatch } from './types'

const phaseNames = [
  '第一天 · 探索',
  '第一次缩圈',
  '圈内探索',
  '第二次缩圈',
  '第一夜',
  '第二天 · 探索',
  '第一次缩圈',
  '圈内探索',
  '第二次缩圈',
  '第二夜',
  '夜王战',
]
const defaultSeconds = [270, 180, 210, 180, 180, 270, 180, 210, 180, 240, 300]

export function usePresetDraft(selected?: Preset) {
  const [draft, setDraft] = useState<Preset | null>(null)
  const [preview, setPreview] = useState<Timeline | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const selectedKey = JSON.stringify(selected)
  useEffect(() => {
    if (selected) {
      setDraft(structuredClone(selected))
      setSavedNote('')
    }
  }, [selectedKey])
  useEffect(() => {
    if (!draft) return
    let active = true
    const timer = setTimeout(
      () =>
        window.nightreign
          .previewTimeline(draft)
          .then((t) => {
            if (active) {
              setPreview(t)
              setPreviewError('')
            }
          })
          .catch((e) => {
            if (active) {
              setPreview(null)
              setPreviewError(String(e.message ?? e))
            }
          }),
      120,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draft])
  const dirty = Boolean(draft && selected && selectedKey !== JSON.stringify(draft))
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  return { draft, setDraft, preview, previewError, savedNote, setSavedNote, dirty }
}
interface Props {
  presets: Preset[]
  selectedId: string
  active: boolean
  editor: ReturnType<typeof usePresetDraft>
  actions: SessionActions
  update(patch: PreferencePatch): void
}
export function RhythmPage({ presets, selectedId, active, editor, actions, update: pref }: Props) {
  const { draft, setDraft, preview, previewError, savedNote, setSavedNote, dirty } = editor
  const { busy, attempt, send, confirm: setConfirm } = actions
  if (!draft) return null
  return (
    <>
      <Panel title="渡夜预设" description="保存你常用的课程节奏。">
        <label className="setting-row">
          <span className="setting-label">当前预设</span>
          <select
            aria-label="当前预设"
            value={selectedId}
            onChange={(e) => {
              const id = e.target.value
              if (dirty)
                setConfirm({
                  title: '切换预设？',
                  body: '未保存的修改将被放弃。',
                  action: '切换',
                  run: () => pref({ selectedPresetId: id }),
                })
              else pref({ selectedPresetId: id })
            }}
          >
            {presets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span className="setting-label">预设名称</span>
          <input
            aria-label="预设名称"
            maxLength={48}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="mode-options" role="group" aria-label="时间模式">
          {(
            [
              { value: 'original', label: '原作节奏', sub: '固定白天，调整战斗' },
              { value: 'classroom', label: '适配课长', sub: '输入总长，自动分配' },
              { value: 'custom', label: '自定义', sub: '逐段安排时间' },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              aria-pressed={draft.mode === m.value}
              className={draft.mode === m.value ? 'active' : ''}
              onClick={() => setDraft({ ...draft, mode: m.value })}
            >
              <strong>{m.label}</strong>
              <span>{m.sub}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title={
          draft.mode === 'custom'
            ? '分段时间'
            : draft.mode === 'classroom'
              ? '课堂时长'
              : '夜晚与决战'
        }
        description={
          draft.mode === 'original'
            ? '两个白天各 14 分钟，缩圈节点与原作节奏一致。'
            : draft.mode === 'classroom'
              ? '保留 28 分钟白天，其余时间分配给三场战斗。最短 31 分钟。'
              : '所有阶段至少 1 秒，总时长不超过 180 分钟。'
        }
      >
        {draft.mode === 'classroom' ? (
          <label className="setting-row">
            <span className="setting-label">总时长</span>
            <span className="number-unit">
              <input
                type="number"
                aria-label="课堂总时长（分钟）"
                min={31}
                max={180}
                step={1}
                value={draft.classroomSeconds / 60}
                onChange={(e) =>
                  setDraft({ ...draft, classroomSeconds: Math.round(Number(e.target.value) * 60) })
                }
              />
              <span>分钟</span>
            </span>
          </label>
        ) : draft.mode === 'original' ? (
          <div className="duration-grid">
            {['第一夜', '第二夜', '夜王战'].map((label, i) => (
              <label key={label}>
                <span>{label}</span>
                <span className="number-unit">
                  <input
                    type="number"
                    aria-label={`${label}时长（秒）`}
                    min={1}
                    max={10800}
                    value={draft.battleSeconds[i]}
                    onChange={(e) => {
                      const next = [...draft.battleSeconds] as [number, number, number]
                      next[i] = Number(e.target.value)
                      setDraft({ ...draft, battleSeconds: next })
                    }}
                  />
                  <span>秒</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="custom-duration-grid">
            {phaseNames.map((name, i) => (
              <label key={i}>
                <span>{name}</span>
                <span className="number-unit">
                  <input
                    type="number"
                    aria-label={`${i + 1}. ${name}（秒）`}
                    min={1}
                    max={10800}
                    value={draft.customSeconds[i] ?? defaultSeconds[i]}
                    onChange={(e) => {
                      const next = [...draft.customSeconds]
                      next[i] = Number(e.target.value)
                      setDraft({ ...draft, customSeconds: next })
                    }}
                  />
                  <span>秒</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {previewError && (
          <p role="alert" className="field-error">
            {previewError}
          </p>
        )}
        {preview && (
          <>
            <div className="preview-total">
              <span>本次渡夜</span>
              <strong>{time(preview.durationMs)}</strong>
            </div>
            <TimelineView timeline={preview} />
            <details className="time-details">
              <summary>查看完整时间线</summary>
              <PhaseList timeline={preview} />
            </details>
          </>
        )}
      </Panel>
      <button
        className="text-button"
        onClick={() =>
          setConfirm({
            title: '恢复默认渡夜节奏？',
            body: '将选中内置的40分钟原作节奏，已保存的自定义预设仍会保留。',
            action: '恢复默认',
            run: () => {
              const builtin = presets.find((x) => x.builtin)
              if (builtin) {
                setDraft(structuredClone(builtin))
                pref({ selectedPresetId: builtin.id })
              }
            },
          })
        }
      >
        恢复本页默认
      </button>
      <footer className="settings-footer">
        <span role="status">
          {savedNote ||
            (active
              ? '新节奏将用于下次出击。'
              : draft.builtin
                ? '内置预设的修改会另存为新预设。'
                : '保存后，下次出击将使用这套节奏。')}
        </span>
        <div>
          {!draft.builtin && (
            <button
              className="text-button danger"
              onClick={() =>
                setConfirm({
                  title: '删除这个预设？',
                  body: `「${draft.name}」将被删除，当前渡夜不会改变。`,
                  action: '删除',
                  run: () => attempt(() => send({ type: 'deletePreset', id: draft.id })),
                })
              }
            >
              删除预设
            </button>
          )}
          <button
            className="primary"
            disabled={busy || !preview || !draft.name.trim()}
            onClick={() =>
              attempt(async () => {
                await send({ type: 'savePreset', preset: draft })
                setSavedNote('已保存，下次出击即可使用。')
              })
            }
          >
            保存节奏
          </button>
        </div>
      </footer>
    </>
  )
}
