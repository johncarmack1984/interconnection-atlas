import { useMemo, useState } from "react"
import * as d3 from "d3"
import { InterconnectionAtlas } from "interconnection-atlas"
import { buildAtlasData, type StateDatum } from "./data/generate"
import { MetricToggle, type MetricOption } from "./components/metric-toggle"
import { DetailPanel } from "./components/detail-panel"

type MetricKey = "capacity" | "wait" | "queue"

// Dark-theme sequential ramps: low values sit near the map background, high
// values glow. One hue per metric so a glance reads the metric, not just a state.
const INTERP: Record<MetricKey, (t: number) => string> = {
  capacity: d3.interpolateRgbBasis(["#152330", "#1f6f4f", "#57d98e"]),
  wait: d3.interpolateRgbBasis(["#152330", "#7a3b2e", "#e8835f"]),
  queue: d3.interpolateRgbBasis(["#152330", "#3a3a6b", "#9b8cf0"]),
}

const ACCESSOR: Record<MetricKey, (s: StateDatum) => number> = {
  capacity: (s) => s.hostingCapacityMw,
  wait: (s) => s.queueWaitMonths,
  queue: (s) => s.queueGw,
}

const LABEL: Record<MetricKey, string> = {
  capacity: "Available hosting capacity (MW)",
  wait: "Median queue wait (months)",
  queue: "Active queue volume (GW)",
}

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))

const FORMAT: Record<MetricKey, (n: number) => string> = {
  capacity: compact,
  wait: (n) => String(Math.round(n)),
  queue: (n) => String(Math.round(n)),
}

const METRIC_OPTIONS: ReadonlyArray<MetricOption<MetricKey>> = [
  { key: "capacity", short: "Hosting capacity", hint: "Available interconnection headroom (MW)" },
  { key: "wait", short: "Queue wait", hint: "Median time a request waits in study (months)" },
  { key: "queue", short: "Queue volume", hint: "Active nameplate capacity in queue (GW)" },
]

export default function App() {
  const data = useMemo(() => buildAtlasData(42), [])
  const [metric, setMetric] = useState<MetricKey>("capacity")
  const [selected, setSelected] = useState<string | null>(null)

  const m = useMemo(() => {
    const accessor = ACCESSOR[metric]
    const vals = data.states.map(accessor)
    const domain: [number, number] = [d3.min(vals) ?? 0, d3.max(vals) ?? 1]
    const values = new Map(data.states.map((s) => [s.id, accessor(s)]))
    return { values, domain, interpolator: INTERP[metric], label: LABEL[metric], format: FORMAT[metric] }
  }, [data, metric])

  return (
    <main className="app">
      <header className="masthead">
        <div className="title">
          <h1>
            US Interconnection Atlas <span className="beta">demo</span>
          </h1>
          <p className="sub">
            Hosting capacity, the interconnection queue, and ISO/RTO territories — in one D3 map.
          </p>
        </div>
        <MetricToggle options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      </header>

      <section className="board">
        <div className="map-col">
          <InterconnectionAtlas
            regions={data.regions}
            isoOutlines={data.isoOutlines}
            values={m.values}
            domain={m.domain}
            colorInterpolator={m.interpolator}
            valueLabel={m.label}
            formatValue={m.format}
            projects={data.projects}
            selectedStateId={selected}
            onSelectState={setSelected}
          />
          <p className="caption">
            Circles are interconnection-queue requests, sized by capacity and colored by status.{" "}
            <strong>Illustrative synthetic data</strong> — shaped to match real ISO queue dynamics
            (solar + storage dominant, heavy withdrawal, ERCOT fast / PJM slow), not actual filings.
          </p>
        </div>

        <DetailPanel
          projects={data.projects}
          states={data.states}
          statesById={data.statesById}
          selectedStateId={selected}
          onClear={() => setSelected(null)}
        />
      </section>

      <footer className="colophon">
        Adapts an interactive market-targeting choropleth pattern, redirected at
        grid interconnection. <code>d3-geo</code> · <code>topojson</code> · <code>us-atlas</code> ·
        React.
      </footer>
    </main>
  )
}
