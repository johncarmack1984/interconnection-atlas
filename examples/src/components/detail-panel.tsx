import { useMemo } from "react"
import {
  FUEL_META,
  FUEL_ORDER,
  STATUS_META,
  STATUS_ORDER,
  type QueueProject,
} from "interconnection-atlas"
import type { Metric, StateDatum } from "../data/dataset"

interface Segment {
  label: string
  color: string
  value: number
}

function MixBar({ title, segments, unit }: { title: string; segments: Segment[]; unit: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const shown = segments.filter((s) => s.value > 0)
  return (
    <div className="mix">
      <div className="mix-title">{title}</div>
      <div className="mix-bar" role="img" aria-label={title}>
        {shown.map((s) => (
          <span
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${fmtAmount(s.value, unit)}`}
          />
        ))}
      </div>
      <ul className="mix-legend">
        {shown.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            <span className="mix-label">{s.label}</span>
            <span className="mix-val">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DetailPanel({
  projects,
  states,
  statesById,
  metrics,
  selectedStateId,
  onClear,
}: {
  projects: QueueProject[]
  states: StateDatum[]
  statesById: Map<string, StateDatum>
  metrics: Metric[]
  selectedStateId: string | null
  onClear: () => void
}) {
  const sel = selectedStateId ? statesById.get(selectedStateId) ?? null : null

  const scoped = useMemo(
    () => (sel ? projects.filter((p) => p.stateId === sel.id) : projects),
    [projects, sel]
  )

  const fuel = useMemo<Segment[]>(
    () =>
      FUEL_ORDER.map((f) => ({
        label: FUEL_META[f].label,
        color: FUEL_META[f].color,
        value: scoped.filter((p) => p.fuel === f).reduce((s, p) => s + p.capacityMw, 0),
      })),
    [scoped]
  )
  const status = useMemo<Segment[]>(
    () =>
      STATUS_ORDER.map((s) => ({
        label: STATUS_META[s].label,
        color: STATUS_META[s].color,
        value: scoped.filter((p) => p.status === s).length,
      })),
    [scoped]
  )

  // One stat per dataset metric — scoped to the selected state, or rolled up
  // nationally via the metric's own aggregator.
  const metricStats = metrics.map((mt) => {
    const v = sel
      ? sel.values[mt.key] ?? 0
      : mt.aggregate
        ? mt.aggregate(states)
        : states.reduce((s, x) => s + (x.values[mt.key] ?? 0), 0)
    return { key: mt.key, label: mt.short, value: `${mt.format(v)}${mt.unit ? ` ${mt.unit}` : ""}` }
  })

  return (
    <aside className="panel">
      {sel ? (
        <header className="panel-head">
          <div>
            <div className="panel-kicker">{sel.iso}</div>
            <h2>{sel.name}</h2>
          </div>
          <button className="clear" onClick={onClear} aria-label="Clear selection">
            ✕
          </button>
        </header>
      ) : (
        <header className="panel-head">
          <div>
            <div className="panel-kicker">National</div>
            <h2>All ISO/RTO regions</h2>
          </div>
        </header>
      )}

      <div className="stat-grid">
        <Stat
          label="Projects"
          value={scoped.length.toLocaleString()}
          hint={sel ? undefined : `across ${states.length} states`}
        />
        {metricStats.map((s) => (
          <Stat key={s.key} label={s.label} value={s.value} />
        ))}
      </div>

      <MixBar title="Capacity by type" segments={fuel} unit="MW" />
      <MixBar title="Requests by status" segments={status} unit="" />

      <p className="panel-foot">
        {sel
          ? "Click the state again, or ✕, to return to the national view."
          : "Click any state to scope these metrics to its queue."}
      </p>
    </aside>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-val">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

function fmtAmount(value: number, unit: string) {
  if (unit === "MW") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} GW` : `${Math.round(value)} MW`
  }
  return unit ? `${Math.round(value)} ${unit}` : String(Math.round(value))
}
