// Maps each US state to the ISO/RTO that operates its bulk grid, plus per-ISO
// display metadata. Real ISO footprints are partial and cross state lines; this
// assigns each state to its dominant operator — accurate enough to reason about
// queue dynamics, and the basis for the merged ISO outlines on the map.
//
// Illustrative, not authoritative: a few states (e.g. eastern Kentucky in PJM,
// the Dakotas split MISO/SPP) are simplified to one operator.

export interface IsoMeta {
  iso: string
  name: string
  color: string
  /** Baseline median interconnection wait, months — tuned per operator so the
   *  generated data reflects real patterns (ERCOT fast; PJM/MISO/ISO-NE slow). */
  waitBaseMonths: number
}

export const ISO_META: Record<string, IsoMeta> = {
  CAISO: { iso: "CAISO", name: "California ISO", color: "#f6a04d", waitBaseMonths: 44 },
  ERCOT: { iso: "ERCOT", name: "Texas (ERCOT)", color: "#5bc8c0", waitBaseMonths: 26 },
  MISO: { iso: "MISO", name: "Midcontinent ISO", color: "#9b8cf0", waitBaseMonths: 58 },
  SPP: { iso: "SPP", name: "Southwest Power Pool", color: "#e0795b", waitBaseMonths: 40 },
  PJM: { iso: "PJM", name: "PJM Interconnection", color: "#5b9bd5", waitBaseMonths: 62 },
  NYISO: { iso: "NYISO", name: "New York ISO", color: "#e06bb0", waitBaseMonths: 46 },
  "ISO-NE": { iso: "ISO-NE", name: "ISO New England", color: "#5fb87a", waitBaseMonths: 60 },
  "Non-ISO": { iso: "Non-ISO", name: "Non-ISO (vertically integrated)", color: "#6c7889", waitBaseMonths: 38 },
}

/** ISOs that get a bold merged outline on the map (Non-ISO is left implicit). */
export const OUTLINED_ISOS = [
  "CAISO",
  "ERCOT",
  "MISO",
  "SPP",
  "PJM",
  "NYISO",
  "ISO-NE",
]

const STATE_ISO: Record<string, string> = {
  California: "CAISO",
  Texas: "ERCOT",
  "New York": "NYISO",
  // ISO-NE
  Maine: "ISO-NE",
  "New Hampshire": "ISO-NE",
  Vermont: "ISO-NE",
  Massachusetts: "ISO-NE",
  "Rhode Island": "ISO-NE",
  Connecticut: "ISO-NE",
  // PJM
  Pennsylvania: "PJM",
  "New Jersey": "PJM",
  Delaware: "PJM",
  Maryland: "PJM",
  Virginia: "PJM",
  "West Virginia": "PJM",
  Ohio: "PJM",
  "District of Columbia": "PJM",
  // MISO
  Minnesota: "MISO",
  Wisconsin: "MISO",
  Iowa: "MISO",
  Illinois: "MISO",
  Indiana: "MISO",
  Michigan: "MISO",
  Missouri: "MISO",
  Arkansas: "MISO",
  Louisiana: "MISO",
  Mississippi: "MISO",
  "North Dakota": "MISO",
  // SPP
  Kansas: "SPP",
  Oklahoma: "SPP",
  Nebraska: "SPP",
  "South Dakota": "SPP",
}

/** ISO for a state name; defaults to Non-ISO (West + Southeast + isolated). */
export function isoForState(name: string): string {
  return STATE_ISO[name] ?? "Non-ISO"
}
