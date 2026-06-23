import { useMemo, useState } from "react"
import * as d3 from "d3"
import { InterconnectionAtlas } from "interconnection-atlas"
import { buildSyntheticDataset } from "./data/generate"
import { loadRealDataset, REAL_META } from "./data/real"
import type { SourceKey } from "./data/dataset"
import { MetricToggle } from "./components/metric-toggle"
import { DetailPanel } from "./components/detail-panel"

const SOURCE_OPTIONS = [
  { key: "real" as SourceKey, short: "Real data", hint: "EIA-860M proposed generators + HIFLD ISO footprints" },
  { key: "synthetic" as SourceKey, short: "Synthetic", hint: "Seeded, illustrative data — deterministic on every load" },
]

export default function App() {
  // Both datasets are bundled and cheap to build, so they're ready up front and
  // the toggle is an instant client-side swap — no fetch, fully offline.
  const synthetic = useMemo(() => buildSyntheticDataset(42), [])
  const real = useMemo(() => loadRealDataset(), [])

  const [source, setSource] = useState<SourceKey>("real")
  const [metricKey, setMetricKey] = useState<string>(real.metrics[0].key)
  const [selected, setSelected] = useState<string | null>(null)

  const data = source === "real" ? real : synthetic
  // Metric keys differ between datasets; fall back to the first if it's missing.
  const metric = data.metrics.find((mt) => mt.key === metricKey) ?? data.metrics[0]

  const changeSource = (s: SourceKey) => {
    setSource(s)
    setMetricKey((s === "real" ? real : synthetic).metrics[0].key)
    setSelected(null)
  }

  const m = useMemo(() => {
    const vals = data.states.map((s) => s.values[metric.key] ?? 0)
    const values = new Map(data.states.map((s) => [s.id, s.values[metric.key] ?? 0]))
    return { values, domain: [d3.min(vals) ?? 0, d3.max(vals) ?? 1] as [number, number] }
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
        <div className="controls">
          <MetricToggle options={SOURCE_OPTIONS} value={source} onChange={changeSource} label="Data source" />
          <MetricToggle options={data.metrics} value={metric.key} onChange={setMetricKey} label="Choropleth metric" />
        </div>
      </header>

      <section className="board">
        <div className="map-col">
          <InterconnectionAtlas
            regions={data.regions}
            isoOutlines={data.isoOutlines}
            values={m.values}
            domain={m.domain}
            colorInterpolator={metric.interpolator}
            valueLabel={metric.label}
            formatValue={metric.format}
            projects={data.projects}
            selectedStateId={selected}
            onSelectState={setSelected}
          />
          {source === "real" ? (
            <p className="caption">
              <strong>Real public data.</strong> Choropleth and circles are{" "}
              {REAL_META.projects.plotted.toLocaleString()} proposed generators from{" "}
              <a href="https://www.eia.gov/electricity/data/eia860m" target="_blank" rel="noreferrer">
                EIA-860M
              </a>{" "}
              (Apr 2026); ISO/RTO outlines are real footprints from{" "}
              <a href="https://hifld-geoplatform.hub.arcgis.com" target="_blank" rel="noreferrer">
                HIFLD
              </a>
              . Proposed generators are a <strong>subset</strong> of the full queue — large loads / data
              centers, withdrawn requests, and true wait-time / hosting-capacity aren&rsquo;t in any public
              project-level source.
            </p>
          ) : (
            <p className="caption">
              Circles are interconnection-queue requests, sized by capacity and colored by status.{" "}
              <strong>Illustrative synthetic data</strong> — shaped to match real ISO queue dynamics
              (solar + storage dominant, heavy withdrawal, ERCOT fast / PJM slow), not actual filings.
            </p>
          )}
        </div>

        <DetailPanel
          projects={data.projects}
          states={data.states}
          statesById={data.statesById}
          metrics={data.metrics}
          selectedStateId={selected}
          onClear={() => setSelected(null)}
        />
      </section>

      <footer className="colophon">
        Adapts an interactive market-targeting choropleth pattern, redirected at grid interconnection.{" "}
        <code>d3-geo</code> · <code>topojson</code> · <code>us-atlas</code> · <code>EIA-860M</code> ·{" "}
        <code>HIFLD</code> · React.
      </footer>
    </main>
  )
}
