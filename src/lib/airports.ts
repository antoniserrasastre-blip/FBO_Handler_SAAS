// Catálogo curado de aeropuertos ICAO relevantes para un FBO basado en LEPA (Palma).

export interface AirportInfo {
  city: string;
  name: string;
}

const AIRPORTS: Record<string, AirportInfo> = {
  // === España (LE_, GC_) ===
  LEPA: { city: "Palma de Mallorca", name: "Son Sant Joan" },
  LEIB: { city: "Ibiza", name: "Ibiza" },
  LEMH: { city: "Menorca", name: "Menorca" },
  LEMG: { city: "Málaga", name: "Costa del Sol" },
  LEMD: { city: "Madrid", name: "Barajas" },
  LECU: { city: "Madrid", name: "Cuatro Vientos" },
  LETO: { city: "Madrid", name: "Torrejón" },
  LEBL: { city: "Barcelona", name: "El Prat" },
  LESB: { city: "Sabadell", name: "Sabadell" },
  LEVC: { city: "Valencia", name: "Manises" },
  LEAL: { city: "Alicante", name: "Alicante-Elche" },
  LEZL: { city: "Sevilla", name: "San Pablo" },
  LEGE: { city: "Girona", name: "Costa Brava" },
  LEBB: { city: "Bilbao", name: "Loiu" },
  LEXJ: { city: "Santander", name: "Seve Ballesteros" },
  LEPP: { city: "Pamplona", name: "Noáin" },
  LEZG: { city: "Zaragoza", name: "Zaragoza" },
  LELC: { city: "Murcia", name: "San Javier" },
  LEMI: { city: "Murcia", name: "Corvera" },
  GCLP: { city: "Las Palmas", name: "Gran Canaria" },
  GCTS: { city: "Tenerife", name: "Tenerife Sur" },
  GCXO: { city: "Tenerife", name: "Tenerife Norte" },
  GCFV: { city: "Fuerteventura", name: "Fuerteventura" },
  GCRR: { city: "Lanzarote", name: "Lanzarote" },
  GCLA: { city: "La Palma", name: "La Palma" },

  // === Francia (LF_) ===
  LFPB: { city: "París", name: "Le Bourget" },
  LFPG: { city: "París", name: "Charles de Gaulle" },
  LFPO: { city: "París", name: "Orly" },
  LFMN: { city: "Niza", name: "Côte d'Azur" },
  LFMD: { city: "Cannes", name: "Mandelieu" },
  LFKC: { city: "Calvi", name: "Sainte-Catherine" },
  LFKJ: { city: "Ajaccio", name: "Napoléon Bonaparte" },
  LFKF: { city: "Figari", name: "Sud-Corse" },
  LFLL: { city: "Lyon", name: "Saint-Exupéry" },
  LFML: { city: "Marsella", name: "Provence" },
  LFBD: { city: "Burdeos", name: "Mérignac" },
  LFBO: { city: "Toulouse", name: "Blagnac" },
  LFST: { city: "Estrasburgo", name: "Entzheim" },
  LFRS: { city: "Nantes", name: "Atlantique" },
  LFSB: { city: "Basilea", name: "Basel-Mulhouse" },

  // === Reino Unido (EG_) ===
  EGGW: { city: "Londres", name: "Luton" },
  EGLF: { city: "Farnborough", name: "Farnborough" },
  EGTK: { city: "Oxford", name: "Oxford" },
  EGKB: { city: "Londres", name: "Biggin Hill" },
  EGLL: { city: "Londres", name: "Heathrow" },
  EGKK: { city: "Londres", name: "Gatwick" },
  EGSS: { city: "Londres", name: "Stansted" },
  EGGD: { city: "Bristol", name: "Bristol" },
  EGCC: { city: "Manchester", name: "Manchester" },
  EGPF: { city: "Glasgow", name: "Glasgow" },
  EGPH: { city: "Edimburgo", name: "Edimburgo" },
  EGNX: { city: "Nottingham", name: "East Midlands" },
  EGJB: { city: "Guernsey", name: "Guernsey" },
  EGJJ: { city: "Jersey", name: "Jersey" },

  // === Suiza (LS_) ===
  LSGG: { city: "Ginebra", name: "Cointrin" },
  LSZH: { city: "Zúrich", name: "Kloten" },
  LSZA: { city: "Lugano", name: "Agno" },
  LSGS: { city: "Sion", name: "Sion" },
  LSZS: { city: "St. Moritz", name: "Samedan" },
  LSZB: { city: "Berna", name: "Belp" },

  // === Italia (LI_) ===
  LIRA: { city: "Roma", name: "Ciampino" },
  LIRF: { city: "Roma", name: "Fiumicino" },
  LIML: { city: "Milán", name: "Linate" },
  LIMC: { city: "Milán", name: "Malpensa" },
  LIPZ: { city: "Venecia", name: "Marco Polo" },
  LIRN: { city: "Nápoles", name: "Capodichino" },
  LICJ: { city: "Palermo", name: "Punta Raisi" },
  LICC: { city: "Catania", name: "Fontanarossa" },
  LIEO: { city: "Olbia", name: "Costa Smeralda" },
  LIEA: { city: "Alghero", name: "Fertilia" },
  LIRQ: { city: "Florencia", name: "Peretola" },
  LIRP: { city: "Pisa", name: "Galileo Galilei" },
  LIPE: { city: "Bolonia", name: "Marconi" },
  LIME: { city: "Bérgamo", name: "Orio al Serio" },
  LIPB: { city: "Bolzano", name: "Bolzano" },
  LIPH: { city: "Treviso", name: "Sant'Angelo" },

  // === Alemania (ED_, ET_) ===
  EDDM: { city: "Múnich", name: "Múnich" },
  EDDF: { city: "Fráncfort", name: "Fráncfort" },
  EDDB: { city: "Berlín", name: "Brandenburgo" },
  EDDH: { city: "Hamburgo", name: "Hamburgo" },
  EDDL: { city: "Düsseldorf", name: "Düsseldorf" },
  EDDS: { city: "Stuttgart", name: "Stuttgart" },
  EDDK: { city: "Colonia", name: "Colonia-Bonn" },
  EDNY: { city: "Friedrichshafen", name: "Friedrichshafen" },
  EDMA: { city: "Augsburgo", name: "Augsburgo" },
  EDSB: { city: "Karlsruhe", name: "Baden-Baden" },
  EDDP: { city: "Leipzig", name: "Leipzig-Halle" },
  EDDV: { city: "Hannover", name: "Hannover" },
  EDDC: { city: "Dresde", name: "Dresde" },

  // === Austria (LO_) ===
  LOWW: { city: "Viena", name: "Schwechat" },
  LOWS: { city: "Salzburgo", name: "W. A. Mozart" },
  LOWI: { city: "Innsbruck", name: "Kranebitten" },
  LOWG: { city: "Graz", name: "Thalerhof" },
  LOWK: { city: "Klagenfurt", name: "Klagenfurt" },

  // === Holanda (EH_) ===
  EHAM: { city: "Ámsterdam", name: "Schiphol" },
  EHRD: { city: "Róterdam", name: "Róterdam-La Haya" },
  EHEH: { city: "Eindhoven", name: "Eindhoven" },

  // === Bélgica/Luxemburgo (EB_, EL_) ===
  EBBR: { city: "Bruselas", name: "Zaventem" },
  EBAW: { city: "Amberes", name: "Deurne" },
  ELLX: { city: "Luxemburgo", name: "Findel" },

  // === Portugal (LP_) ===
  LPPT: { city: "Lisboa", name: "Humberto Delgado" },
  LPPR: { city: "Oporto", name: "Sá Carneiro" },
  LPFR: { city: "Faro", name: "Faro" },
  LPMA: { city: "Madeira", name: "Cristiano Ronaldo" },
  LPCS: { city: "Cascais", name: "Tires" },

  // === Escandinavia (EK_, ES_, EN_, EF_) ===
  EKCH: { city: "Copenhague", name: "Kastrup" },
  ESSA: { city: "Estocolmo", name: "Arlanda" },
  ESSB: { city: "Estocolmo", name: "Bromma" },
  ENGM: { city: "Oslo", name: "Gardermoen" },
  EFHK: { city: "Helsinki", name: "Vantaa" },

  // === Grecia (LG_) ===
  LGAV: { city: "Atenas", name: "Eleftherios Venizelos" },
  LGMK: { city: "Mykonos", name: "Mykonos" },
  LGSR: { city: "Santorini", name: "Santorini" },
  LGRP: { city: "Rodas", name: "Diagoras" },
  LGKR: { city: "Corfú", name: "Ioannis Kapodistrias" },
  LGKO: { city: "Kos", name: "Hipócrates" },

  // === Malta/Chipre (LM_, LC_) ===
  LMML: { city: "Malta", name: "Luqa" },
  LCLK: { city: "Lárnaca", name: "Lárnaca" },
  LCPH: { city: "Pafos", name: "Pafos" },

  // === Centro/Este Europa ===
  LKPR: { city: "Praga", name: "Václav Havel" },
  LZIB: { city: "Bratislava", name: "M. R. Štefánik" },
  LHBP: { city: "Budapest", name: "Ferenc Liszt" },
  EPWA: { city: "Varsovia", name: "Chopin" },
  LJLJ: { city: "Liubliana", name: "Jože Pučnik" },
  LDZA: { city: "Zagreb", name: "Franjo Tuđman" },
  LDDU: { city: "Dubrovnik", name: "Dubrovnik" },
  LDSP: { city: "Split", name: "Split" },
  LYBE: { city: "Belgrado", name: "Nikola Tesla" },
  LBSF: { city: "Sofía", name: "Sofía" },
  LROP: { city: "Bucarest", name: "Henri Coandă" },

  // === Irlanda (EI_) ===
  EIDW: { city: "Dublín", name: "Dublín" },
  EICK: { city: "Cork", name: "Cork" },
  EINN: { city: "Shannon", name: "Shannon" },

  // === Turquía (LT_) ===
  LTBA: { city: "Estambul", name: "Atatürk" },
  LTFM: { city: "Estambul", name: "IGA" },
  LTBJ: { city: "Izmir", name: "Adnan Menderes" },
  LTAI: { city: "Antalya", name: "Antalya" },
  LTFE: { city: "Bodrum", name: "Milas-Bodrum" },
  LTBS: { city: "Dalaman", name: "Dalaman" },

  // === Magreb/Mediterráneo Sur (GM_, DA_, DT_, HE_, LL_) ===
  GMMX: { city: "Marrakech", name: "Menara" },
  GMAD: { city: "Agadir", name: "Al Massira" },
  GMME: { city: "Rabat", name: "Salé" },
  GMMC: { city: "Casablanca", name: "Mohammed V" },
  GMTT: { city: "Tánger", name: "Ibn Battouta" },
  DAAG: { city: "Argel", name: "Houari Boumédiène" },
  DTTA: { city: "Túnez", name: "Cartago" },
  DTMB: { city: "Monastir", name: "Habib Bourguiba" },
  HECA: { city: "El Cairo", name: "El Cairo" },
  HESH: { city: "Sharm El-Sheikh", name: "Sharm El-Sheikh" },
  HEGN: { city: "Hurgada", name: "Hurgada" },
  LLBG: { city: "Tel Aviv", name: "Ben Gurion" },

  // === USA (K_) ===
  KJFK: { city: "Nueva York", name: "JFK" },
  KLGA: { city: "Nueva York", name: "LaGuardia" },
  KEWR: { city: "Newark", name: "Newark" },
  KTEB: { city: "Teterboro", name: "Teterboro" },
  KLAX: { city: "Los Ángeles", name: "LAX" },
  KVNY: { city: "Los Ángeles", name: "Van Nuys" },
  KSFO: { city: "San Francisco", name: "SFO" },
  KMIA: { city: "Miami", name: "Miami" },
  KOPF: { city: "Miami", name: "Opa-Locka" },
  KFLL: { city: "Fort Lauderdale", name: "Fort Lauderdale" },
  KPBI: { city: "West Palm Beach", name: "Palm Beach" },
  KBOS: { city: "Boston", name: "Logan" },
  KBED: { city: "Bedford", name: "Hanscom" },
  KIAD: { city: "Washington", name: "Dulles" },
  KDCA: { city: "Washington", name: "Reagan National" },
  KIAH: { city: "Houston", name: "Intercontinental" },
  KHOU: { city: "Houston", name: "Hobby" },
  KDAL: { city: "Dallas", name: "Love Field" },
  KDFW: { city: "Dallas", name: "Fort Worth" },
  KORD: { city: "Chicago", name: "O'Hare" },
  KMDW: { city: "Chicago", name: "Midway" },
  KASE: { city: "Aspen", name: "Pitkin County" },
  KEGE: { city: "Vail", name: "Eagle County" },
  KLAS: { city: "Las Vegas", name: "Harry Reid" },
  KSDL: { city: "Scottsdale", name: "Scottsdale" },
  KSEA: { city: "Seattle", name: "Tacoma" },
  KATL: { city: "Atlanta", name: "Hartsfield-Jackson" },
  KMSY: { city: "Nueva Orleans", name: "Louis Armstrong" },
  KMMU: { city: "Morristown", name: "Morristown" },
  KHPN: { city: "White Plains", name: "Westchester County" },

  // === Caribe ===
  MUHA: { city: "La Habana", name: "José Martí" },
  MDPC: { city: "Punta Cana", name: "Punta Cana" },
  MDSD: { city: "Santo Domingo", name: "Las Américas" },
  MKJS: { city: "Montego Bay", name: "Sangster" },
  MYNN: { city: "Nassau", name: "Lynden Pindling" },
  TNCM: { city: "St. Maarten", name: "Princess Juliana" },
  TBPB: { city: "Barbados", name: "Grantley Adams" },
  MBPV: { city: "Providenciales", name: "Providenciales" },

  // === Centro/Sudamérica ===
  MMMX: { city: "Ciudad de México", name: "Benito Juárez" },
  MMSD: { city: "Los Cabos", name: "San José del Cabo" },
  MMUN: { city: "Cancún", name: "Cancún" },
  SBGR: { city: "São Paulo", name: "Guarulhos" },
  SBSP: { city: "São Paulo", name: "Congonhas" },
  SAEZ: { city: "Buenos Aires", name: "Ezeiza" },
  SCEL: { city: "Santiago", name: "Arturo Merino Benítez" },
  SKBO: { city: "Bogotá", name: "El Dorado" },

  // === Oriente Medio (OM_, OB_, OT_, OE_, OO_, OK_, OL_) ===
  OMDB: { city: "Dubái", name: "Dubái Intl" },
  OMDW: { city: "Dubái", name: "Al Maktoum" },
  OMAA: { city: "Abu Dabi", name: "Abu Dabi" },
  OMSJ: { city: "Sharjah", name: "Sharjah" },
  OBBI: { city: "Bahréin", name: "Bahréin" },
  OTHH: { city: "Doha", name: "Hamad" },
  OERK: { city: "Riad", name: "Rey Khalid" },
  OEJN: { city: "Yeda", name: "Rey Abdulaziz" },
  OEMA: { city: "Medina", name: "Príncipe Mohammad bin Abdulaziz" },
  OOMS: { city: "Mascate", name: "Mascate" },
  OKBK: { city: "Kuwait", name: "Kuwait" },
  OLBA: { city: "Beirut", name: "Rafic Hariri" },

  // === Asia/Pacífico ===
  VHHH: { city: "Hong Kong", name: "Chek Lap Kok" },
  RJTT: { city: "Tokio", name: "Haneda" },
  RJAA: { city: "Tokio", name: "Narita" },
  RKSI: { city: "Seúl", name: "Incheon" },
  WSSS: { city: "Singapur", name: "Changi" },
  WMKK: { city: "Kuala Lumpur", name: "KLIA" },
  VTBS: { city: "Bangkok", name: "Suvarnabhumi" },
  VTBD: { city: "Bangkok", name: "Don Mueang" },
  WIII: { city: "Yakarta", name: "Soekarno-Hatta" },
  RPLL: { city: "Manila", name: "Ninoy Aquino" },
  VIDP: { city: "Delhi", name: "Indira Gandhi" },
  VABB: { city: "Mumbai", name: "Chhatrapati Shivaji" },
  VOMM: { city: "Chennai", name: "Chennai" },
  VOBL: { city: "Bangalore", name: "Kempegowda" },
  ZBAA: { city: "Pekín", name: "Capital" },
  ZSPD: { city: "Shanghái", name: "Pudong" },
  ZGGG: { city: "Cantón", name: "Baiyun" },

  // === África subsahariana ===
  FACT: { city: "Ciudad del Cabo", name: "Ciudad del Cabo" },
  FAJS: { city: "Johannesburgo", name: "O. R. Tambo" },
  HKJK: { city: "Nairobi", name: "Jomo Kenyatta" },
  DNMM: { city: "Lagos", name: "Murtala Muhammed" },
  GOOY: { city: "Dakar", name: "Léopold Sédar Senghor" },

  // === Rusia/CIS (UU_, UL_) ===
  UUEE: { city: "Moscú", name: "Sheremétievo" },
  UUDD: { city: "Moscú", name: "Domodédovo" },
  UUWW: { city: "Moscú", name: "Vnúkovo" },
  UUMU: { city: "Moscú", name: "Ostafyevo" },
  ULLI: { city: "San Petersburgo", name: "Púlkovo" },
};

export function getAirportInfo(icao: string | null | undefined): AirportInfo | null {
  if (!icao) return null;
  const key = icao.trim().toUpperCase();
  if (!key) return null;
  return AIRPORTS[key] ?? null;
}
