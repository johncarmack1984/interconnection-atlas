import type { Feature, FeatureCollection, Geometry } from "geojson"

/** Lifecycle of an interconnection-queue request. */
export type QueueStatus = "active" | "under-study" | "operational" | "withdrawn"

/** Generation / load type of a queued project. */
export type Fuel = "solar" | "wind" | "storage" | "gas" | "load"

/** A single interconnection-queue request, plotted as a point on the map. */
export interface QueueProject {
  id: string
  name: string
  /** Longitude / latitude (WGS84). */
  lon: number
  lat: number
  /** Nameplate capacity (generation) or peak demand (load), in MW. */
  capacityMw: number
  fuel: Fuel
  status: QueueStatus
  /** FIPS id of the containing state (joins to a region feature `id`). */
  stateId: string
  /** ISO/RTO the project sits in (e.g. "ERCOT", "PJM", "Non-ISO"). */
  iso: string
  /** Year the request entered the queue. */
  queueYear: number
}

/** Region polygons (US states). `id` is a 2-digit FIPS string; props carry the name. */
export type RegionCollection = FeatureCollection<Geometry, { name: string }>

/** Properties attached to a merged ISO/RTO outline. */
export interface IsoOutlineProps {
  iso: string
  name: string
  color: string
}
export type IsoOutline = Feature<Geometry, IsoOutlineProps>
export type IsoOutlineCollection = FeatureCollection<Geometry, IsoOutlineProps>

// ---------------------------------------------------------------------------
// Shared visual vocabulary — owned here so the map component and the example's
// panels/legends color things identically from one source of truth.
// ---------------------------------------------------------------------------

export const STATUS_META: Record<QueueStatus, { label: string; color: string }> = {
  active: { label: "Active in queue", color: "#5b9bd5" },
  "under-study": { label: "Under study", color: "#e0a458" },
  operational: { label: "Operational", color: "#5fb87a" },
  withdrawn: { label: "Withdrawn", color: "#6c7889" },
}

export const FUEL_META: Record<Fuel, { label: string; color: string }> = {
  solar: { label: "Solar", color: "#f6c453" },
  storage: { label: "Battery storage", color: "#9b8cf0" },
  wind: { label: "Wind", color: "#5bc8c0" },
  load: { label: "Large load (data center)", color: "#e06bb0" },
  gas: { label: "Gas", color: "#e0795b" },
}

export const STATUS_ORDER: QueueStatus[] = [
  "active",
  "under-study",
  "operational",
  "withdrawn",
]

export const FUEL_ORDER: Fuel[] = ["solar", "storage", "wind", "load", "gas"]
