// OpenSky Network REST client — anonymous or basic auth.
// https://opensky-network.org/apidoc/rest.html
//
// We poll /api/states/all with a bounding box around LEPA (Palma de Mallorca).
// Authenticated users get higher daily credit budgets; pass OPENSKY_USER /
// OPENSKY_PASS in env to enable.

export type OpenSkyState = {
  icao24: string;            // 24-bit hex aircraft address (lowercase)
  callsign: string | null;   // trimmed, may be empty
  originCountry: string;
  timePosition: number | null;
  lastContact: number;
  longitude: number | null;
  latitude: number | null;
  baroAltitudeM: number | null;
  onGround: boolean;
  velocityMs: number | null;
  trueTrack: number | null;
  verticalRateMs: number | null;
  geoAltitudeM: number | null;
  squawk: string | null;
  spi: boolean;
  positionSource: number;
};

// Bounding box around LEPA (Palma). Roughly 80nm radius — captures the full
// approach phase from any direction.
export const LEPA_BBOX = {
  lamin: 38.6,
  lamax: 40.4,
  lomin: 1.3,
  lomax: 4.2,
} as const;

const STATES_URL = "https://opensky-network.org/api/states/all";

type StateTuple = [
  string,            // 0: icao24
  string | null,     // 1: callsign
  string,            // 2: origin_country
  number | null,     // 3: time_position
  number,            // 4: last_contact
  number | null,     // 5: longitude
  number | null,     // 6: latitude
  number | null,     // 7: baro_altitude
  boolean,           // 8: on_ground
  number | null,     // 9: velocity
  number | null,     // 10: true_track
  number | null,     // 11: vertical_rate
  number[] | null,   // 12: sensors
  number | null,     // 13: geo_altitude
  string | null,     // 14: squawk
  boolean,           // 15: spi
  number,            // 16: position_source
];

export function parseState(tuple: StateTuple): OpenSkyState {
  return {
    icao24: tuple[0],
    callsign: tuple[1]?.trim() || null,
    originCountry: tuple[2],
    timePosition: tuple[3],
    lastContact: tuple[4],
    longitude: tuple[5],
    latitude: tuple[6],
    baroAltitudeM: tuple[7],
    onGround: tuple[8],
    velocityMs: tuple[9],
    trueTrack: tuple[10],
    verticalRateMs: tuple[11],
    geoAltitudeM: tuple[13],
    squawk: tuple[14],
    spi: tuple[15],
    positionSource: tuple[16],
  };
}

export type FetchStatesOptions = {
  bbox?: { lamin: number; lamax: number; lomin: number; lomax: number };
  user?: string;
  pass?: string;
  signal?: AbortSignal;
};

export async function fetchStates(opts: FetchStatesOptions = {}): Promise<OpenSkyState[]> {
  const bbox = opts.bbox ?? LEPA_BBOX;
  const url = `${STATES_URL}?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  const user = opts.user ?? process.env.OPENSKY_USER;
  const pass = opts.pass ?? process.env.OPENSKY_PASS;
  if (user && pass) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }

  const res = await fetch(url, { headers, signal: opts.signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`OpenSky ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const body = (await res.json()) as { states: StateTuple[] | null };
  if (!body.states) return [];
  return body.states.map(parseState);
}
