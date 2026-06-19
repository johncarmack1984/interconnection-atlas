import { useMemo, useRef, useState, type PointerEvent } from "react"
import * as d3 from "d3"
import type {
  IsoOutlineCollection,
  QueueProject,
  RegionCollection,
} from "./types"
import { STATUS_META, STATUS_ORDER } from "./types"

export interface InterconnectionAtlasProps {
  /** State polygons to draw as the choropleth. */
  regions: RegionCollection
  /** Merged ISO/RTO boundaries, drawn as bold outlines over the choropleth. */
  isoOutlines: IsoOutlineCollection
  /** Region `id` (FIPS) → the metric value that drives its fill color. */
  values: Map<string, number>
  /** [min, max] for the sequential color scale. */
  domain: [number, number]
  /** d3 interpolator mapping 0–1 to a color (e.g. d3.interpolateGreens). */
  colorInterpolator: (t: number) => string
  /** Human label for the active metric (legend title + tooltip). */
  valueLabel: string
  /** Formats a metric value for display. */
  formatValue: (n: number) => string
  /** Interconnection-queue requests, plotted as points. */
  projects: QueueProject[]
  selectedStateId?: string | null
  onSelectState?: (id: string | null) => void
  width?: number
  height?: number
}

interface Tip {
  x: number
  y: number
  title: string
  rows: Array<[string, string]>
  accent: string
}

const EMPTY_FILL = "#16222f"

export function InterconnectionAtlas({
  regions,
  isoOutlines,
  values,
  domain,
  colorInterpolator,
  valueLabel,
  formatValue,
  projects,
  selectedStateId = null,
  onSelectState,
  width = 975,
  height = 610,
}: InterconnectionAtlasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [hoverState, setHoverState] = useState<string | null>(null)

  // geoAlbersUsa handles the AK/HI insets; fit it to the drawing area once.
  const projection = useMemo(
    () => d3.geoAlbersUsa().fitSize([width, height], regions),
    [regions, width, height]
  )
  const path = useMemo(() => d3.geoPath(projection), [projection])

  const color = useMemo(
    () => d3.scaleSequential(colorInterpolator).domain(domain),
    [colorInterpolator, domain]
  )

  const radius = useMemo(() => {
    const max = d3.max(projects, (p) => p.capacityMw) ?? 1
    return d3.scaleSqrt().domain([0, max]).range([1.4, 20])
  }, [projects])

  // Project lon/lat → screen coords up front; drop anything geoAlbersUsa can't
  // place (outside the US clip). Draw withdrawn first / largest first so the
  // live, smaller projects stay legible on top.
  const points = useMemo(() => {
    const placed = projects
      .map((p) => {
        const xy = projection([p.lon, p.lat])
        return xy ? { p, x: xy[0], y: xy[1] } : null
      })
      .filter((d): d is { p: QueueProject; x: number; y: number } => d !== null)
    placed.sort((a, b) => {
      const s = STATUS_ORDER.indexOf(b.p.status) - STATUS_ORDER.indexOf(a.p.status)
      return s !== 0 ? s : b.p.capacityMw - a.p.capacityMw
    })
    return placed
  }, [projects, projection])

  const showTip = (e: PointerEvent, t: Omit<Tip, "x" | "y">) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    setTip({
      ...t,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    })
  }

  return (
    <div ref={wrapRef} className="atlas" style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`United States interconnection atlas colored by ${valueLabel}`}
      >
        {/* Choropleth: states filled by the active metric */}
        <g>
          {regions.features.map((f) => {
            const id = String(f.id)
            const v = values.get(id)
            const isHot = hoverState === id || selectedStateId === id
            return (
              <path
                key={id}
                d={path(f) ?? undefined}
                fill={v == null ? EMPTY_FILL : color(v)}
                stroke={isHot ? "#eaf2ff" : "#0c1622"}
                strokeWidth={isHot ? 1.4 : 0.5}
                style={{ cursor: "pointer", transition: "stroke-width 0.1s" }}
                onPointerEnter={(e) => {
                  setHoverState(id)
                  showTip(e, {
                    title: f.properties.name,
                    accent: v == null ? "#6c7889" : color(v),
                    rows: [
                      [valueLabel, v == null ? "n/a" : formatValue(v)],
                    ],
                  })
                }}
                onPointerMove={(e) =>
                  setTip((t) => {
                    if (!t) return t
                    const rect = wrapRef.current?.getBoundingClientRect()
                    return {
                      ...t,
                      x: e.clientX - (rect?.left ?? 0),
                      y: e.clientY - (rect?.top ?? 0),
                    }
                  })
                }
                onPointerLeave={() => {
                  setHoverState(null)
                  setTip(null)
                }}
                onClick={() =>
                  onSelectState?.(selectedStateId === id ? null : id)
                }
              />
            )
          })}
        </g>

        {/* ISO/RTO territory outlines, merged from the underlying states */}
        <g pointerEvents="none">
          {isoOutlines.features.map((f) => (
            <path
              key={f.properties.iso}
              d={path(f) ?? undefined}
              fill="none"
              stroke={f.properties.color}
              strokeWidth={1.6}
              strokeOpacity={0.9}
              strokeLinejoin="round"
            />
          ))}
          {isoOutlines.features.map((f) => {
            const [cx, cy] = path.centroid(f)
            if (!Number.isFinite(cx)) return null
            return (
              <text
                key={`${f.properties.iso}-label`}
                x={cx}
                y={cy}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={f.properties.color}
                stroke="#0c1622"
                strokeWidth={2.6}
                paintOrder="stroke"
                style={{ letterSpacing: 0.4 }}
              >
                {f.properties.iso}
              </text>
            )
          })}
        </g>

        {/* Interconnection-queue projects */}
        <g>
          {points.map(({ p, x, y }) => (
            <circle
              key={p.id}
              cx={x}
              cy={y}
              r={radius(p.capacityMw)}
              fill={STATUS_META[p.status].color}
              fillOpacity={p.status === "withdrawn" ? 0.32 : 0.78}
              stroke="#0c1622"
              strokeWidth={0.5}
              style={{ cursor: "pointer" }}
              onPointerEnter={(e) =>
                showTip(e, {
                  title: p.name,
                  accent: STATUS_META[p.status].color,
                  rows: [
                    ["Capacity", `${formatMw(p.capacityMw)} MW`],
                    ["Type", labelFuel(p.fuel)],
                    ["Status", STATUS_META[p.status].label],
                    ["ISO / RTO", p.iso],
                    ["In queue since", String(p.queueYear)],
                  ],
                })
              }
              onPointerMove={(e) =>
                setTip((t) => {
                  if (!t) return t
                  const rect = wrapRef.current?.getBoundingClientRect()
                  return {
                    ...t,
                    x: e.clientX - (rect?.left ?? 0),
                    y: e.clientY - (rect?.top ?? 0),
                  }
                })
              }
              onPointerLeave={() => setTip(null)}
            />
          ))}
        </g>

        <ChoroplethLegend
          interpolator={colorInterpolator}
          domain={domain}
          label={valueLabel}
          format={formatValue}
          x={26}
          y={height - 86}
        />
        <StatusLegend x={width - 168} y={height - 116} />
      </svg>

      {tip && <Tooltip tip={tip} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Tooltip({ tip }: { tip: Tip }) {
  return (
    <div
      className="atlas-tooltip"
      style={{
        position: "absolute",
        left: tip.x + 14,
        top: tip.y + 14,
        pointerEvents: "none",
        maxWidth: 240,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(10, 18, 28, 0.94)",
        border: `1px solid ${tip.accent}`,
        boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
        color: "#e7eef7",
        font: "12px/1.45 ui-sans-serif, system-ui, sans-serif",
        zIndex: 5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: tip.rows.length ? 4 : 0 }}>
        {tip.title}
      </div>
      {tip.rows.map(([k, v]) => (
        <div
          key={k}
          style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <span style={{ color: "#9fb0c3" }}>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function ChoroplethLegend({
  interpolator,
  domain,
  label,
  format,
  x,
  y,
}: {
  interpolator: (t: number) => string
  domain: [number, number]
  label: string
  format: (n: number) => string
  x: number
  y: number
}) {
  const W = 184
  const stops = 28
  const ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <text fontSize={11} fontWeight={600} fill="#c8d4e2" y={-8}>
        {label}
      </text>
      {d3.range(stops).map((i) => (
        <rect
          key={i}
          x={(i / stops) * W}
          y={0}
          width={W / stops + 0.6}
          height={9}
          fill={interpolator(i / (stops - 1))}
        />
      ))}
      <rect x={0} y={0} width={W} height={9} fill="none" stroke="#0c1622" />
      {ticks.map((t, i) => (
        <text
          key={i}
          x={i === 0 ? 0 : i === ticks.length - 1 ? W : W / 2}
          y={22}
          fontSize={10}
          fill="#9fb0c3"
          textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {format(t)}
        </text>
      ))}
    </g>
  )
}

function StatusLegend({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <text fontSize={11} fontWeight={600} fill="#c8d4e2" y={-6}>
        Queue project status
      </text>
      {STATUS_ORDER.map((s, i) => (
        <g key={s} transform={`translate(0, ${i * 18 + 4})`}>
          <circle cx={5} cy={5} r={5} fill={STATUS_META[s].color} />
          <text x={16} y={9} fontSize={11} fill="#c8d4e2">
            {STATUS_META[s].label}
          </text>
        </g>
      ))}
    </g>
  )
}

function formatMw(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

function labelFuel(f: QueueProject["fuel"]) {
  return f === "load" ? "Large load (data center)" : f[0].toUpperCase() + f.slice(1)
}

export default InterconnectionAtlas
