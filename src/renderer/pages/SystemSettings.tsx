import type { Preferences } from '../../contracts/types'
import { Panel, Toggle } from '../components/Controls'
import type { SavePreferences, SettingsProps } from './types'

interface Props extends SettingsProps {
  shortcutDraft: Preferences['shortcuts'] | null
  setShortcutDraft(value: Preferences['shortcuts'] | null): void
  savedNote: string
  setSavedNote(note: string): void
  savePreferences: SavePreferences
}
export function SystemSettings({
  preferences: p,
  update: pref,
  reset,
  shortcutDraft,
  setShortcutDraft,
  savedNote,
  setSavedNote,
  savePreferences,
}: Props) {
  return (
    <>
      <Panel title="离开与回来">
        <Toggle
          label="开机启动"
          description="登录电脑后，小蜗自动回到桌面。"
          value={p.autoStart}
          onChange={(autoStart) => pref({ autoStart })}
        />
        <Toggle
          label="锁屏后暂停"
          description="解锁后等待你点击继续；电脑睡眠时始终暂停。"
          value={p.pauseOnLock}
          onChange={(pauseOnLock) => pref({ pauseOnLock })}
        />
        <div className="setting-row">
          <div>
            <span className="setting-label">离开后的进度</span>
            <p>退出时保存渡夜，下次打开可以继续。离线期间不计时。</p>
          </div>
          <span className="status-tag">自动保存</span>
        </div>
      </Panel>
      <Panel
        title="全局快捷键"
        description="填写组合键，例如 CommandOrControl+Shift+N。留空即可取消绑定。"
      >
        {shortcutDraft &&
          (['settings', 'pause', 'visibility', 'clickThrough'] as const).map((key, i) => (
            <label className="setting-row" key={key}>
              <span className="setting-label">
                {['打开设置', '暂停或继续', '显示或隐藏小蜗', '切换鼠标穿透'][i]}
              </span>
              <input
                aria-label={`${['打开设置', '暂停或继续', '显示或隐藏小蜗', '切换鼠标穿透'][i]}快捷键`}
                placeholder="未绑定"
                value={shortcutDraft[key]}
                onChange={(e) => setShortcutDraft({ ...shortcutDraft, [key]: e.target.value })}
              />
            </label>
          ))}
        <div className="panel-actions">
          <button
            onClick={() =>
              shortcutDraft &&
              savePreferences({ shortcuts: shortcutDraft })
                .then(() => setSavedNote('快捷键已保存'))
                .catch(() => {})
            }
          >
            保存快捷键
          </button>
          <span role="status">{savedNote}</span>
        </div>
      </Panel>
      <button
        className="text-button"
        onClick={() => {
          reset({
            autoStart: false,
            pauseOnLock: true,
            shortcuts: { settings: '', pause: '', visibility: '', clickThrough: '' },
          })
          setShortcutDraft(null)
        }}
      >
        恢复本页默认
      </button>
    </>
  )
}
