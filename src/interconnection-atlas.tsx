import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import * as d3 from "d3"
import type {
  IsoOutlineCollection,
  QueueProject,
  RegionCollection,
} from "./types"
import { STATUS_META, STATUS_ORDER } from "./types"
import { nearestInDirection } from "./nav"

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
  /** Accessible name for the map as a whole. Defaults to a phrase built from
   *  `valueLabel`. */
  mapLabel?: string
  /** Label for the per-project year row in the point tooltip. Defaults to
   *  "In queue since"; real-data mode passes "Planned online" because the value
   *  is the EIA planned-operation year, not a queue-entry date. */
  projectYearLabel?: string
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

/** A queue project projected to screen coordinates. */
type PlacedPoint = { p: QueueProject; x: number; y: number }

const EMPTY_FILL = "#16222f"
const EMPTY_ACCENT = "#6c7889"

// Scoped styles the component owns so it stays self-contained (no external CSS
// needed): the keyboard focus ring on states, and a reduced-motion guard that
// drops the stroke transition. `.ia-sr-only` hides text visually but keeps it for
// screen readers (the instructions, points summary, and live-region copy).
const ATLAS_CSS = `
.ia-state { cursor: pointer; transition: stroke-width 0.1s, stroke 0.1s; vector-effect: non-scaling-stroke; }
.ia-state:focus { outline: none; }
.ia-state:focus-visible { stroke: #eaf2ff !important; stroke-width: 2.4px !important; }
.ia-zoom { position: absolute; top: 10px; left: 10px; display: flex; flex-direction: column; gap: 5px; z-index: 4; }
.ia-zoom button { width: 30px; height: 30px; padding: 0; display: grid; place-items: center; font: 600 18px/1 ui-sans-serif, system-ui, sans-serif; color: #c8d4e2; background: rgba(12, 22, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 7px; cursor: pointer; appearance: none; -webkit-appearance: none; }
.ia-zoom button:hover { background: rgba(22, 34, 48, 0.95); color: #eaf2ff; }
.ia-zoom button:focus-visible { outline: 2px solid #eaf2ff; outline-offset: 2px; }
.ia-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ia-state { transition: none !important; }
}
`

// Inject the component's scoped styles once per document, however many
// <InterconnectionAtlas> instances mount — the rules are global (`.ia-state`,
// `.ia-zoom`, `.ia-sr-only`), so a <style> per instance just duplicates them.
let stylesInjected = false
function useAtlasStyles() {
  useEffect(() => {
    if (stylesInjected || typeof document === "undefined") return
    stylesInjected = true
    const el = document.createElement("style")
    el.dataset.interconnectionAtlas = ""
    el.textContent = ATLAS_CSS
    document.head.appendChild(el)
  }, [])
}

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
  mapLabel,
  projectYearLabel = "In queue since",
  width = 975,
  height = 610,
}: InterconnectionAtlasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [zoomT, setZoomT] = useState(() => d3.zoomIdentity)
  const [tip, setTip] = useState<Tip | null>(null)
  const [hoverState, setHoverState] = useState<string | null>(null)
  // The state the roving tabindex currently rests on (one Tab stop for the whole
  // choropleth); arrow keys move it. Null until first focus → falls back below.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState("")

  const baseId = useId()
  const summaryId = `${baseId}-summary`
  useAtlasStyles()

  // geoAlbersUsa handles the AK/HI insets; fit it to the drawing area once.
  const projection = useMemo(
    () => d3.geoAlbersUsa().fitSize([width, height], regions),
    [regions, width, height]
  )
  const path = useMemo(() => d3.geoPath(projection), [projection])

  const color = useMemo(() => {
    // Guard a zero-width domain (a single-value metric): a [x, x] domain maps
    // every value to NaN → an undefined fill, so nudge the upper bound.
    const [lo, hi] = domain
    return d3.scaleSequential(colorInterpolator).domain(lo === hi ? [lo, lo + 1] : domain)
  }, [colorInterpolator, domain])

  const radius = useMemo(() => {
    const max = d3.max(projects, (p) => p.capacityMw) ?? 1
    return d3.scaleSqrt().domain([0, max]).range([1.4, 20])
  }, [projects])

  const nameById = useMemo(
    () => new Map(regions.features.map((f) => [String(f.id), f.properties.name])),
    [regions]
  )

  // Screen-projected centroids, used to find the spatially-nearest state for
  // arrow-key navigation (and the AK/HI-aware Tab landing spot).
  const centroidById = useMemo(() => {
    const m = new Map<string, [number, number]>()
    for (const f of regions.features) {
      const c = path.centroid(f)
      if (Number.isFinite(c[0]) && Number.isFinite(c[1])) m.set(String(f.id), [c[0], c[1]])
    }
    return m
  }, [regions, path])

  // The single Tab stop: the focused state, else the selection, else the first
  // drawable state. Keeps exactly one state at tabIndex 0.
  const firstId = centroidById.keys().next().value ?? null
  const rovingOwner =
    (focusId && centroidById.has(focusId) && focusId) ||
    (selectedStateId && centroidById.has(selectedStateId) && selectedStateId) ||
    firstId

  // Points → screen coords up front; drop anything geoAlbersUsa can't place.
  // Draw withdrawn first / largest first so live, smaller projects stay legible.
  const points = useMemo(() => {
    const placed = projects
      .map((p) => {
        const xy = projection([p.lon, p.lat])
        return xy ? { p, x: xy[0], y: xy[1] } : null
      })
      .filter((d): d is PlacedPoint => d !== null)
    placed.sort((a, b) => {
      const s = STATUS_ORDER.indexOf(b.p.status) - STATUS_ORDER.indexOf(a.p.status)
      return s !== 0 ? s : b.p.capacityMw - a.p.capacityMw
    })
    return placed
  }, [projects, projection])

  // Aggregate the points for screen-reader users instead of exposing ~240 tab
  // stops; mirrors what the colored circles convey visually.
  const pointsSummary = useMemo(() => {
    const counts: Partial<Record<QueueProject["status"], number>> = {}
    for (const p of projects) counts[p.status] = (counts[p.status] ?? 0) + 1
    const parts = STATUS_ORDER.filter((s) => counts[s]).map(
      (s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`
    )
    return `${projects.length} interconnection-queue projects${parts.length ? `: ${parts.join(", ")}` : ""}.`
  }, [projects])

  const mapName = mapLabel ?? `United States interconnection atlas, colored by ${valueLabel}`

  const showTip = useCallback((e: PointerEvent, t: Omit<Tip, "x" | "y">) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    setTip({ ...t, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) })
  }, [])

  // Track the cursor on every pointer-move so the tooltip stays lively. The point
  // layer is memoized (<QueuePoints>), so a per-move parent re-render only touches
  // the tooltip + the ~50 state paths — cheap enough that throttling isn't needed.
  const moveTip = useCallback((clientX: number, clientY: number) => {
    setTip((t) => {
      if (!t) return t
      const rect = wrapRef.current?.getBoundingClientRect()
      return { ...t, x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
    })
  }, [])
  const hideTip = useCallback(() => setTip(null), [])

  const stateRows = (v: number | undefined): Array<[string, string]> => [
    [valueLabel, v == null ? "n/a" : formatValue(v)],
  ]

  const onStateFocus = (_e: FocusEvent<SVGPathElement>, id: string, v: number | undefined) => {
    setFocusId(id)
    setHoverState(id)
    setAnnounce(`${nameById.get(id) ?? id}: ${valueLabel} ${v == null ? "no data" : formatValue(v)}`)
    const el = pathRefs.current.get(id)
    const wrap = wrapRef.current
    if (el && wrap) {
      const r = el.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      setTip({
        x: r.left - w.left + r.width / 2,
        y: r.top - w.top + r.height / 2,
        title: nameById.get(id) ?? id,
        accent: v == null ? EMPTY_ACCENT : color(v),
        rows: stateRows(v),
      })
    }
  }

  const onStateBlur = () => {
    setHoverState(null)
    setTip(null)
  }

  const moveFocus = (fromId: string, dx: number, dy: number) => {
    const best = nearestInDirection(centroidById, fromId, dx, dy)
    if (best) {
      setFocusId(best)
      pathRefs.current.get(best)?.focus()
    }
  }

  const onStateKeyDown = (e: KeyboardEvent<SVGPathElement>, id: string) => {
    switch (e.key) {
      case "Enter":
      case " ":
      case "Spacebar":
        e.preventDefault()
        setAnnounce(
          selectedStateId === id
            ? "Selection cleared"
            : `${nameById.get(id) ?? id} selected`
        )
        onSelectState?.(selectedStateId === id ? null : id)
        break
      case "Escape":
        if (selectedStateId != null) {
          e.preventDefault()
          setAnnounce("Selection cleared")
          onSelectState?.(null)
        }
        break
      case "ArrowRight":
        e.preventDefault()
        moveFocus(id, 1, 0)
        break
      case "ArrowLeft":
        e.preventDefault()
        moveFocus(id, -1, 0)
        break
      case "ArrowUp":
        e.preventDefault()
        moveFocus(id, 0, -1)
        break
      case "ArrowDown":
        e.preventDefault()
        moveFocus(id, 0, 1)
        break
    }
  }

  // Wheel-pinch (trackpad / touchscreen) + drag-pan via d3-zoom; the +/- buttons
  // drive it programmatically. A plain wheel scroll passes through (filter below)
  // so the page still scrolls past the map. Transform rides a wrapper <g>, so the
  // memoized point layer isn't re-rendered while zooming.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey : !e.button))
      .on("zoom", (e) => setZoomT(e.transform))
    zoomRef.current = zoom
    const sel = d3.select(svg)
    sel.call(zoom).on("dblclick.zoom", null)
    return () => {
      sel.on(".zoom", null)
      zoomRef.current = null
    }
  }, [width, height])

  const zoomBy = (factor: number) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    if (!svg || !zoom) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    d3.select(svg)
      .transition()
      .duration(reduce ? 0 : 250)
      .call(zoom.scaleBy, factor)
  }

  return (
    <div ref={wrapRef} className="atlas" style={{ position: "relative" }}>
      <div className="ia-zoom">
        <button type="button" onClick={() => zoomBy(1.5)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
        role="group"
        aria-label={mapName}
        aria-describedby={summaryId}
      >
        {/* All map layers ride one zoom/pan transform; legends stay fixed below. */}
        <g transform={zoomT.toString()}>
        {/* Choropleth: each state is a toggle button, keyboard-navigable */}
        <g
          role="group"
          aria-label="US states — arrow keys move between states, Enter or Space selects, Escape clears"
        >
          {regions.features.map((f) => {
            const id = String(f.id)
            const v = values.get(id)
            const isSelected = selectedStateId === id
            const isHot = hoverState === id || isSelected
            const name = f.properties.name
            return (
              <path
                key={id}
                ref={(el) => {
                  if (el) pathRefs.current.set(id, el)
                  else pathRefs.current.delete(id)
                }}
                className="ia-state"
                d={path(f) ?? undefined}
                fill={v == null ? EMPTY_FILL : color(v)}
                stroke={isHot ? "#eaf2ff" : "#0c1622"}
                strokeWidth={isHot ? 1.4 : 0.5}
                role="button"
                tabIndex={id === rovingOwner ? 0 : -1}
                aria-pressed={isSelected}
                aria-label={`${name}: ${valueLabel} ${v == null ? "no data" : formatValue(v)}${isSelected ? ", selected" : ""}`}
                onKeyDown={(e) => onStateKeyDown(e, id)}
                onFocus={(e) => onStateFocus(e, id, v)}
                onBlur={onStateBlur}
                onPointerEnter={(e) => {
                  setHoverState(id)
                  showTip(e, {
                    title: name,
                    accent: v == null ? EMPTY_ACCENT : color(v),
                    rows: stateRows(v),
                  })
                }}
                onPointerMove={(e) => moveTip(e.clientX, e.clientY)}
                onPointerLeave={() => {
                  setHoverState(null)
                  setTip(null)
                }}
                onClick={() => onSelectState?.(isSelected ? null : id)}
              />
            )
          })}
        </g>

        {/* ISO/RTO territory outlines, merged from the underlying states */}
        <g pointerEvents="none" aria-hidden="true">
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

        {/* Interconnection-queue projects (summarized for AT via the map's
            aria-describedby; individually hidden to avoid a tab stop per point).
            Memoized so hover / tooltip updates don't re-render the whole layer. */}
        <QueuePoints
          points={points}
          radius={radius}
          projectYearLabel={projectYearLabel}
          onEnter={showTip}
          onMove={moveTip}
          onLeave={hideTip}
        />
        </g>

        {/* Top band over the Great Lakes — clear of the AK/HI insets bottom-left. */}
        <ChoroplethLegend
          interpolator={colorInterpolator}
          domain={domain}
          label={valueLabel}
          format={formatValue}
          x={420}
          y={28}
        />
        <StatusLegend x={width - 135} y={height - 118} />
      </svg>

      <div id={summaryId} className="ia-sr-only">
        {pointsSummary}
      </div>
      <div className="ia-sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      {tip && <Tooltip tip={tip} />}
    </div>
  )
}

// The queue-point layer, split out and memoized so the parent's hover/tooltip
// re-renders don't reconcile the full set of circles (real-data mode plots ~2,000).
// Every prop is referentially stable across hover — data-derived memos plus
// useCallback handlers — so React.memo skips it until the data itself changes.
const QueuePoints = memo(function QueuePoints({
  points,
  radius,
  projectYearLabel,
  onEnter,
  onMove,
  onLeave,
}: {
  points: PlacedPoint[]
  radius: (mw: number) => number
  projectYearLabel: string
  onEnter: (e: PointerEvent, t: Omit<Tip, "x" | "y">) => void
  onMove: (clientX: number, clientY: number) => void
  onLeave: () => void
}) {
  return (
    <g aria-hidden="true">
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
            onEnter(e, {
              title: p.name,
              accent: STATUS_META[p.status].color,
              rows: [
                ["Capacity", `${formatMw(p.capacityMw)} MW`],
                ["Type", labelFuel(p.fuel)],
                ["Status", STATUS_META[p.status].label],
                ["ISO / RTO", p.iso],
                [projectYearLabel, String(p.queueYear)],
              ],
            })
          }
          onPointerMove={(e) => onMove(e.clientX, e.clientY)}
          onPointerLeave={onLeave}
        />
      ))}
    </g>
  )
})

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
  // Panel hugs the wider of the gradient bar and the (variable-length) title.
  const panelW = Math.max(W, label.length * 6.5) + 16
  const stops = 28
  const ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none" aria-hidden="true">
      {/* Backing panel so the legend reads cleanly over the (zoomable) map. */}
      <rect
        x={-9}
        y={-23}
        width={panelW}
        height={55}
        rx={8}
        fill="rgba(12, 22, 34, 0.85)"
        stroke="rgba(255, 255, 255, 0.14)"
      />
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
    <g transform={`translate(${x},${y})`} pointerEvents="none" aria-hidden="true">
      {/* Backing panel so the legend reads cleanly over the map. */}
      <rect
        x={-9}
        y={-20}
        width={136}
        height={98}
        rx={8}
        fill="rgba(12,22,34,0.85)"
        stroke="rgba(255,255,255,0.14)"
      />
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
