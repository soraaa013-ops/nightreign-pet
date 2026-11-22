import type { DesktopApi } from '../../contracts/types'
import { Panel, Select, Slider, Toggle } from '../components/Controls'
import type { SettingsProps } from './types'

interface Props extends SettingsProps {
  visible: boolean
  send: DesktopApi['command']
}
export function PetSettings({ preferences: p, update: pref, reset, visible, send }: Props) {
  return (
    <>
      <Panel title="桌面上的小蜗">
        <Slider
          label="小蜗大小"
          value={p.scale}
          min={50}
          max={200}
          onChange={(scale) => pref({ scale })}
        />
        <Toggle
          label="窗口置顶"
          description="让小蜗显示在普通应用窗口上方。"
          value={p.alwaysOnTop}
          onChange={(alwaysOnTop) => pref({ alwaysOnTop })}
        />
        <Toggle
          label="锁定位置"
          description="禁止拖动，仍可轻点互动。"
          value={p.positionLocked}
          onChange={(positionLocked) => pref({ positionLocked })}
        />
        <Toggle
          label="鼠标穿透"
          description="鼠标直接操作下方窗口。可从系统托盘关闭穿透。"
          value={p.clickThrough}
          onChange={(clickThrough) => pref({ clickThrough })}
        />
        <Select
          label="计时环"
          value={p.statusBar}
          options={[
            { value: 'hidden', label: '隐藏' },
            { value: 'compact', label: '简洁 · 仅显示表盘' },
            { value: 'detailed', label: '详细 · 显示阶段和倒计时' },
          ]}
          onChange={(statusBar) => pref({ statusBar })}
        />
      </Panel>
      <Panel title="位置与可见性">
        <div className="setting-row">
          <div>
            <span className="setting-label">找回小蜗</span>
            <p>将它移回主屏幕的可见区域。</p>
          </div>
          <button onClick={() => send({ type: 'resetPosition' }).catch(() => {})}>重置位置</button>
        </div>
        <Toggle
          label="显示小蜗"
          description="隐藏不影响渡夜计时，可从系统托盘重新显示。"
          value={visible}
          onChange={(visible) => send({ type: 'visibility', visible }).catch(() => {})}
        />
      </Panel>
      <button
        className="text-button"
        onClick={() =>
          reset({
            scale: 100,
            alwaysOnTop: true,
            positionLocked: false,
            clickThrough: false,
            statusBar: 'compact',
          })
        }
      >
        恢复本页默认
      </button>
    </>
  )
}
