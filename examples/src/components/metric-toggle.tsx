export interface MetricOption<K extends string> {
  key: K
  short: string
  hint: string
}

export function MetricToggle<K extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<MetricOption<K>>
  value: K
  onChange: (k: K) => void
}) {
  return (
    <div className="toggle" role="tablist" aria-label="Choropleth metric">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={o.key === value}
          className={o.key === value ? "is-active" : ""}
          onClick={() => onChange(o.key)}
          title={o.hint}
        >
          {o.short}
        </button>
      ))}
    </div>
  )
}
