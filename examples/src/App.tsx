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
          <a
            className="repo-link"
            href="https://github.com/johncarmack1984/interconnection-atlas"
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View source on GitHub
          </a>
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
            projectYearLabel={source === "real" ? "Planned online" : "In queue since"}
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
              . The <strong>Canceled / postponed</strong> metric sums EIA&rsquo;s canceled-or-postponed
              sheet ({REAL_META.canceled.totalGw.toLocaleString()} GW over{" "}
              {REAL_META.canceled.rows.toLocaleString()} units) as an attrition proxy. Proposed generators
              are a <strong>subset</strong> of the full queue — the per-project year is{" "}
              <strong>planned online</strong>, not queue entry, and large loads / data centers, withdrawn
              requests, and true wait-time / hosting-capacity aren&rsquo;t in any public project-level source.
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
