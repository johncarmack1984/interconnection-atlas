import { useRef, type KeyboardEvent } from "react"

export interface MetricOption<K extends string> {
  key: K
  short: string
  hint: string
}

// A single-select segmented control. Modeled as an ARIA radiogroup (not a
// tablist — there are no tab panels): one Tab stop, arrow keys move + select.
export function MetricToggle<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<MetricOption<K>>
  value: K
  onChange: (k: K) => void
  label: string
}) {
  const refs = useRef(new Map<K, HTMLButtonElement>())
  const index = options.findIndex((o) => o.key === value)

  const moveBy = (delta: number) => {
    if (!options.length) return
    const next = options[(index + delta + options.length) % options.length]
    onChange(next.key)
    refs.current.get(next.key)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      moveBy(1)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      moveBy(-1)
    }
  }

  return (
    <div className="toggle" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          ref={(el) => {
            if (el) refs.current.set(o.key, el)
            else refs.current.delete(o.key)
          }}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          tabIndex={o.key === value ? 0 : -1}
          className={o.key === value ? "is-active" : ""}
          onClick={() => onChange(o.key)}
          onKeyDown={onKeyDown}
          title={o.hint}
        >
          {o.short}
        </button>
      ))}
    </div>
  )
}
