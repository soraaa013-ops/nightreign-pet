import type { DesktopApi } from '../../contracts/types'
import { Panel, Select, Slider, Toggle } from '../components/Controls'
import type { SettingsProps } from './types'

interface Props extends SettingsProps {
  send: DesktopApi['command']
  soundTest(): void
}
export function SoundSettings({ preferences: p, update: pref, reset, send, soundTest }: Props) {
  return (
    <>
      <Panel title="声音">
        <Toggle
          label="总静音"
          description="关闭全部声音，保留原有音量。"
          value={p.muted}
          onChange={(muted) => pref({ muted })}
        />
        <Slider
          label="提示与战斗音效"
          value={p.sfxVolume}
          onChange={(sfxVolume) => pref({ sfxVolume })}
        />
        <div className="setting-row">
          <div>
            <span className="setting-label">试听提示音</span>
            <p>试听遵循静音与安静模式设置。</p>
          </div>
          <button onClick={soundTest}>试听</button>
        </div>
        <div className="setting-row">
          <div>
            <span className="setting-label">背景音乐</span>
            <p>尚未配置可用曲目。</p>
          </div>
          <button disabled>未配置</button>
        </div>
        <Toggle
          label="安静模式"
          description="临时静音并减少演出；关闭后恢复此前偏好。"
          value={p.quietMode}
          onChange={(quietMode) => pref({ quietMode })}
        />
      </Panel>
      <Panel title="演出">
        <Toggle
          label="缩圈提示音"
          description="开始缩圈时播放提示音，缩圈进度始终显示在状态条。"
          value={p.shrinkAlerts}
          onChange={(shrinkAlerts) => pref({ shrinkAlerts })}
        />
        <Select
          label="演出强度"
          value={p.intensity}
          options={[
            { value: 'low', label: '低 · 减少动态效果' },
            { value: 'standard', label: '标准 · 夜雨与光环' },
            { value: 'high', label: '强 · 增加夜雨效果' },
          ]}
          onChange={(intensity) => pref({ intensity })}
        />
        <Select
          label="结算位置"
          value={p.victoryPosition}
          options={[
            { value: 'pet', label: '小蜗附近' },
            { value: 'center', label: '屏幕中央' },
          ]}
          onChange={(victoryPosition) => pref({ victoryPosition })}
        />
        <div className="setting-row">
          <div>
            <span className="setting-label">预览演出</span>
            <p>在桌宠附近预览，不改变渡夜进度。</p>
          </div>
          <button onClick={() => send({ type: 'preview' }).catch(() => {})}>预览</button>
        </div>
      </Panel>
      <button
        className="text-button"
        onClick={() =>
          reset({
            muted: false,
            quietMode: false,
            sfxVolume: 20,
            musicVolume: 0,
            shrinkAlerts: true,
            intensity: 'standard',
            victoryPosition: 'pet',
          })
        }
      >
        恢复本页默认
      </button>
    </>
  )
}
