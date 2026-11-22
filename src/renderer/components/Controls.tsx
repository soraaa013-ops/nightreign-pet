import { useEffect, useRef, type ReactNode } from 'react'
export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="setting-row">
      <div>
        <span className="setting-label">{label}</span>
        {description && <p>{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  )
}
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  description?: string
}) {
  return (
    <label className="setting-row">
      <span>
        <span className="setting-label">{label}</span>
        {description && <span className="field-description">{description}</span>}
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  suffix = '%',
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="setting-row">
      <span className="setting-label">{label}</span>
      <span className="slider-control">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>
          {value}
          {suffix}
        </output>
      </span>
    </label>
  )
}
export function Panel({
  title,
  children,
  description,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="settings-panel">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  )
}
export function Confirm({
  title,
  children,
  action,
  onConfirm,
  onCancel,
  onSave,
}: {
  title: string
  children: ReactNode
  action: string
  onConfirm: () => void
  onCancel: () => void
  onSave?: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        if (e.key === 'Tab') {
          const items = ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, [tabindex="0"]',
          )
          if (!items?.length) return
          const first = items[0],
            last = items[items.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="modal"
      >
        <span className="eyebrow">确认操作</span>
        <h2 id="confirm-title">{title}</h2>
        <p>{children}</p>
        <footer>
          <button onClick={onCancel}>取消</button>
          <button className={onSave ? '' : 'primary'} onClick={onConfirm}>
            {action}
          </button>
          {onSave && (
            <button className="primary" onClick={onSave}>
              保存并离开
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
