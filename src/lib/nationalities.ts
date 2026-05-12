// Nationality / country lookup → ISO-3 code.
// Covers EU + Schengen + most common visitors at PMI (Mallorcair traffic).
// Includes English and Spanish demonyms + the ISO-3 code itself.
//
// Add new entries lower-cased, accent-stripped. The `lookupNationality`
// helper does the same normalisation on input.

const TABLE: Record<string, string> = {
  // ── ISO-3 codes (passthrough) ──
  esp: "ESP", deu: "DEU", fra: "FRA", ita: "ITA", gbr: "GBR", prt: "PRT",
  nld: "NLD", bel: "BEL", aut: "AUT", che: "CHE", dnk: "DNK", swe: "SWE",
  nor: "NOR", fin: "FIN", isl: "ISL", irl: "IRL", lux: "LUX", mlt: "MLT",
  mco: "MCO", grc: "GRC", pol: "POL", cze: "CZE", svk: "SVK", hun: "HUN",
  rou: "ROU", bgr: "BGR", hrv: "HRV", svn: "SVN", est: "EST", lva: "LVA",
  ltu: "LTU", cyp: "CYP", and: "AND", smr: "SMR", vat: "VAT", lie: "LIE",
  usa: "USA", can: "CAN", mex: "MEX", bra: "BRA", arg: "ARG", chl: "CHL",
  rus: "RUS", ukr: "UKR", tur: "TUR", mar: "MAR", isr: "ISR", are: "ARE",
  sau: "SAU", qat: "QAT", kwt: "KWT", bhr: "BHR", omn: "OMN", egy: "EGY",
  zaf: "ZAF", aus: "AUS", nzl: "NZL", chn: "CHN", jpn: "JPN", kor: "KOR",
  hkg: "HKG", twn: "TWN", sgp: "SGP", ind: "IND", tha: "THA", phl: "PHL",
  idn: "IDN", mys: "MYS", vnm: "VNM", srb: "SRB", alb: "ALB", mkd: "MKD",
  bih: "BIH", mne: "MNE", lbn: "LBN", jor: "JOR", dza: "DZA", tun: "TUN",
  nga: "NGA", ken: "KEN", col: "COL", per: "PER", ven: "VEN", ury: "URY",

  // ── EU / Schengen — English + Spanish demonyms ──
  spain: "ESP", spanish: "ESP", española: "ESP", espanola: "ESP",
  españa: "ESP", espana: "ESP", español: "ESP",
  germany: "DEU", german: "DEU", alemania: "DEU", alemán: "DEU", aleman: "DEU", alemana: "DEU",
  france: "FRA", french: "FRA", francia: "FRA", francés: "FRA", frances: "FRA", francesa: "FRA",
  italy: "ITA", italian: "ITA", italia: "ITA", italiano: "ITA", italiana: "ITA",
  "united kingdom": "GBR", uk: "GBR", british: "GBR", britain: "GBR",
  "great britain": "GBR", england: "GBR", english: "GBR",
  "reino unido": "GBR", "ru": "GBR", británico: "GBR", britanico: "GBR", inglesa: "GBR", ingles: "GBR",
  portugal: "PRT", portuguese: "PRT", portugués: "PRT", portugues: "PRT", portuguesa: "PRT",
  netherlands: "NLD", dutch: "NLD", holland: "NLD", "países bajos": "NLD",
  "paises bajos": "NLD", holanda: "NLD", holandés: "NLD", holandes: "NLD", holandesa: "NLD",
  belgium: "BEL", belgian: "BEL", bélgica: "BEL", belgica: "BEL", belga: "BEL",
  austria: "AUT", austrian: "AUT", austríaco: "AUT", austriaco: "AUT", austríaca: "AUT",
  switzerland: "CHE", swiss: "CHE", suiza: "CHE", suizo: "CHE",
  denmark: "DNK", danish: "DNK", dinamarca: "DNK", danés: "DNK", danes: "DNK", danesa: "DNK",
  sweden: "SWE", swedish: "SWE", suecia: "SWE", sueco: "SWE", sueca: "SWE",
  norway: "NOR", norwegian: "NOR", noruega: "NOR", noruego: "NOR", noruega_adj: "NOR",
  finland: "FIN", finnish: "FIN", finlandia: "FIN", finlandés: "FIN", finlandes: "FIN",
  iceland: "ISL", icelandic: "ISL", islandia: "ISL", islandés: "ISL", islandes: "ISL",
  ireland: "IRL", irish: "IRL", irlanda: "IRL", irlandés: "IRL", irlandes: "IRL", irlandesa: "IRL",
  luxembourg: "LUX", luxembourgish: "LUX", luxemburgo: "LUX", luxemburgués: "LUX",
  malta: "MLT", maltese: "MLT", maltés: "MLT", maltes: "MLT",
  monaco: "MCO", monegasque: "MCO", mónaco: "MCO",
  greece: "GRC", greek: "GRC", grecia: "GRC", griego: "GRC", griega: "GRC",
  poland: "POL", polish: "POL", polonia: "POL", polaco: "POL", polaca: "POL",
  "czech republic": "CZE", czech: "CZE", chequia: "CZE", checo: "CZE", checa: "CZE",
  slovakia: "SVK", slovak: "SVK", eslovaquia: "SVK", eslovaco: "SVK",
  hungary: "HUN", hungarian: "HUN", hungría: "HUN", hungria: "HUN", húngaro: "HUN", hungaro: "HUN",
  romania: "ROU", romanian: "ROU", rumania: "ROU", rumano: "ROU",
  bulgaria: "BGR", bulgarian: "BGR", búlgaro: "BGR", bulgaro: "BGR",
  croatia: "HRV", croatian: "HRV", croacia: "HRV", croata: "HRV",
  slovenia: "SVN", slovenian: "SVN", eslovenia: "SVN", esloveno: "SVN",
  estonia: "EST", estonian: "EST", estonio: "EST",
  latvia: "LVA", latvian: "LVA", letonia: "LVA", letón: "LVA", leton: "LVA",
  lithuania: "LTU", lithuanian: "LTU", lituania: "LTU", lituano: "LTU",
  cyprus: "CYP", cypriot: "CYP", chipre: "CYP", chipriota: "CYP",
  liechtenstein: "LIE",

  // ── Non-EU common visitors ──
  "united states": "USA", american: "USA", "estados unidos": "USA", eeuu: "USA", "u.s.a.": "USA", us: "USA",
  estadounidense: "USA",
  canada: "CAN", canadian: "CAN", canadá: "CAN", canadiense: "CAN",
  mexico: "MEX", mexican: "MEX", méxico: "MEX", mexicano: "MEX",
  brazil: "BRA", brazilian: "BRA", brasil: "BRA", brasileño: "BRA", brasileno: "BRA",
  argentina: "ARG", argentinian: "ARG", argentino: "ARG",
  russia: "RUS", russian: "RUS", rusia: "RUS", ruso: "RUS", rusa: "RUS",
  ukraine: "UKR", ukrainian: "UKR", ucrania: "UKR", ucraniano: "UKR",
  turkey: "TUR", turkish: "TUR", turquía: "TUR", turquia: "TUR", turco: "TUR",
  morocco: "MAR", moroccan: "MAR", marruecos: "MAR", marroquí: "MAR", marroqui: "MAR",
  israel: "ISR", israeli: "ISR", israelí: "ISR",
  "united arab emirates": "ARE", uae: "ARE", emirati: "ARE", "emiratos árabes unidos": "ARE",
  "emiratos arabes unidos": "ARE", emirates: "ARE",
  "saudi arabia": "SAU", saudi: "SAU", "arabia saudí": "SAU", "arabia saudita": "SAU", saudí: "SAU", saudita: "SAU",
  qatar: "QAT", qatari: "QAT", catarí: "QAT",
  kuwait: "KWT", kuwaiti: "KWT", kuwaití: "KWT",
  australia: "AUS", australian: "AUS", australiano: "AUS",
  "new zealand": "NZL", "nueva zelanda": "NZL",
  china: "CHN", chinese: "CHN", chino: "CHN",
  japan: "JPN", japanese: "JPN", japón: "JPN", japones: "JPN", japonés: "JPN",
  philippines: "PHL", filipino: "PHL", filipinas: "PHL",
  india: "IND", indian: "IND", indio: "IND", india_adj: "IND",
  serbia: "SRB", serbian: "SRB", serbio: "SRB",
};

/** Strip diacritics, lowercase, collapse whitespace. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Try to resolve a free-text nationality to ISO-3.
 * Returns null if no match.
 */
export function lookupNationality(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalise(raw);
  if (!key) return null;
  return TABLE[key] ?? null;
}

/**
 * Whether a token (single word/phrase) plausibly looks like a nationality.
 * Used by the parser to decide if a token slot is the nationality field.
 */
export function isNationalityToken(token: string): boolean {
  return lookupNationality(token) !== null;
}
