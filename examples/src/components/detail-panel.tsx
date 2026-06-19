import { useMemo } from "react"
import {
  FUEL_META,
  FUEL_ORDER,
  STATUS_META,
  STATUS_ORDER,
  type QueueProject,
} from "interconnection-atlas"
import type { StateDatum } from "../data/generate"

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
  selectedStateId,
  onClear,
}: {
  projects: QueueProject[]
  states: StateDatum[]
  statesById: Map<string, StateDatum>
  selectedStateId: string | null
  onClear: () => void
}) {
  const sel = selectedStateId ? statesById.get(selectedStateId) ?? null : null

  const scoped = useMemo(
    () => (sel ? projects.filter((p) => p.stateId === sel.id) : projects),
    [projects, sel]
  )

  const stats = useMemo(() => {
    const count = scoped.length
    const withdrawn = scoped.filter((p) => p.status === "withdrawn").length
    const fuel: Segment[] = FUEL_ORDER.map((f) => ({
      label: FUEL_META[f].label,
      color: FUEL_META[f].color,
      value: scoped.filter((p) => p.fuel === f).reduce((s, p) => s + p.capacityMw, 0),
    }))
    const status: Segment[] = STATUS_ORDER.map((s) => ({
      label: STATUS_META[s].label,
      color: STATUS_META[s].color,
      value: scoped.filter((p) => p.status === s).length,
    }))
    const queueGw = sel ? sel.queueGw : states.reduce((s, x) => s + x.queueGw, 0)
    const wait = sel ? sel.queueWaitMonths : median(states.map((x) => x.queueWaitMonths))
    return {
      count,
      withdrawalRate: count ? withdrawn / count : 0,
      fuel,
      status,
      queueGw,
      wait,
    }
  }, [scoped, sel, states])

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
        <Stat label="Queue volume" value={`${fmtNum(stats.queueGw)} GW`} />
        {sel ? (
          <Stat label="Hosting headroom" value={`${fmtNum(sel.hostingCapacityMw)} MW`} />
        ) : (
          <Stat label="Regions" value={String(states.length)} />
        )}
        <Stat label="Median wait" value={`${stats.wait} mo`} />
        <Stat
          label="Withdrawal rate"
          value={`${Math.round(stats.withdrawalRate * 100)}%`}
          hint={`${stats.count} projects shown`}
        />
      </div>

      <MixBar title="Capacity by type" segments={stats.fuel} unit="MW" />
      <MixBar title="Requests by status" segments={stats.status} unit="" />

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

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US")
}

function fmtAmount(value: number, unit: string) {
  if (unit === "MW") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} GW` : `${Math.round(value)} MW`
  }
  return unit ? `${Math.round(value)} ${unit}` : String(Math.round(value))
}
