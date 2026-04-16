// Seed crew and passenger data extracted from GenDec scanned PDFs
// Source: docs/LLEGADAS 13 ABRIL.pdf + docs/SALIDAS 13 ABRIL.pdf
//
// Usage: DATABASE_URL="file:$(pwd)/prisma/dev.db" npx tsx scripts/seed-gendec-13apr.ts
// Or with Turso: npx tsx scripts/seed-gendec-13apr.ts

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;
if (process.env.TURSO_DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaLibSql } = require("@prisma/adapter-libsql");
  const adapter = new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  prisma = new PrismaClient({ adapter });
} else {
  prisma = new PrismaClient();
}

interface PersonEntry {
  fullName: string;
  dateOfBirth?: string;
  passportNumber?: string;
  nationality?: string;
  role?: string; // for crew: CAPTAIN | FIRST_OFFICER | CABIN_CREW | OTHER
  status?: string; // for pax: CONFIRMED | NO_SHOW
}

interface GenDecEntry {
  registration: string; // match key
  direction: "ARRIVAL" | "DEPARTURE";
  crew: PersonEntry[];
  passengers: PersonEntry[];
}

// ══════════════════════════════════════════════════════════════════
// DATA EXTRACTED FROM SCANNED GENDEC PDFs — 13 APRIL 2026
// ══════════════════════════════════════════════════════════════════

const gendecData: GenDecEntry[] = [
  // ── LLEGADAS (Arrivals) ──────────────────────────────────────
  {
    registration: "OE-GLB", direction: "ARRIVAL",
    crew: [
      { fullName: "Frank Claessens", dateOfBirth: "27/01/1979", passportNumber: "C717C9VJY", nationality: "DEU" },
      { fullName: "Vasco Daniel Maia Miguel", dateOfBirth: "12/12/2002", passportNumber: "CF828980", nationality: "PRT" },
    ],
    passengers: [
      { fullName: "Teresa Francesca Schell", dateOfBirth: "07/07/1997", passportNumber: "C86HT6314", nationality: "DEU" },
      { fullName: "Amilia Lou Schell", dateOfBirth: "23/12/2025", passportNumber: "CGGHZ2P2X", nationality: "DEU" },
      { fullName: "Benjamin Florian Stoll", dateOfBirth: "10/09/1978", passportNumber: "C86H915TW", nationality: "DEU" },
    ],
  },
  {
    registration: "CS-LUB", direction: "ARRIVAL",
    crew: [
      { fullName: "Frederick Hugo Donato DEufemia", dateOfBirth: "27/05/1985", passportNumber: "144084048", nationality: "GBR" },
      { fullName: "Rodrigo Julian Donado Vara", dateOfBirth: "13/07/1976", passportNumber: "PAM553055", nationality: "ESP" },
    ],
    passengers: [
      { fullName: "Julia Marie Motka", dateOfBirth: "21/02/2012", passportNumber: "215651848", nationality: "CZE" },
      { fullName: "Jana Motkova", dateOfBirth: "10/04/1959", passportNumber: "206823861", nationality: "CZE" },
      { fullName: "Cherry Rose Querijero", dateOfBirth: "11/08/1990", passportNumber: "P6261053B", nationality: "PHL" },
    ],
  },
  {
    registration: "D-CAGA", direction: "ARRIVAL",
    crew: [
      { fullName: "Robin Schlothmann", dateOfBirth: "29/11/1985", passportNumber: "C1764XZRL", nationality: "DEU" },
      { fullName: "Marc Hansmeier", dateOfBirth: "29/02/1992", passportNumber: "CHR143844", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Jost Stefan Heinig", dateOfBirth: "02/08/1962", passportNumber: "C7XF99P0W", nationality: "DEU" },
      { fullName: "Dilan Aze Edenhofner Erdem", dateOfBirth: "01/03/1996", passportNumber: "L7045CYTV", nationality: "DEU" },
      { fullName: "Melih Sascha Edenhofner", dateOfBirth: "23/01/2021", passportNumber: "L15XTWPRH", nationality: "DEU" },
      { fullName: "Thomas Josef Aundrup", dateOfBirth: "09/03/1962", passportNumber: "L7P32YXTY", nationality: "DEU" },
      { fullName: "Bettina Schluter", dateOfBirth: "15/12/1968", passportNumber: "L7XGCP43T", nationality: "DEU" },
    ],
  },
  {
    registration: "CS-LTD", direction: "ARRIVAL",
    crew: [
      { fullName: "Nuno Pedro Alves Chermont Bandeira", dateOfBirth: "21/05/1985", passportNumber: "CB901409", nationality: "PRT" },
      { fullName: "Henrique Filipe Goncalves Granito", dateOfBirth: "16/12/1980", passportNumber: "CE743342", nationality: "PRT" },
    ],
    passengers: [
      { fullName: "Lea Kramer", dateOfBirth: "29/08/1997", passportNumber: "YB8652914", nationality: "ITA" },
      { fullName: "Romain Pierre Emmanuel de Meyer", dateOfBirth: "06/05/1994", passportNumber: "X0F31Z62", nationality: "CHE" },
      { fullName: "Olivia de Meyer", dateOfBirth: "04/05/2021", passportNumber: "X0E96F56", nationality: "CHE" },
      { fullName: "Julie de Meyer", dateOfBirth: "28/03/1991", passportNumber: "X0T96C02", nationality: "CHE" },
      { fullName: "Jerome Christian Leo de Meyer", dateOfBirth: "03/11/1963", passportNumber: "X0X29Z12", nationality: "CHE" },
      { fullName: "Catherine de Meyer", dateOfBirth: "10/11/1962", passportNumber: "X0B05Q95", nationality: "CHE" },
      { fullName: "Stephanie Marie-Paule de Meyer", dateOfBirth: "29/05/1970", passportNumber: "X1466086", nationality: "CHE", status: "NO_SHOW" },
    ],
  },
  {
    registration: "CS-LTE", direction: "ARRIVAL",
    crew: [
      { fullName: "Lieven M. Delamper", dateOfBirth: "31/03/1967", passportNumber: "GC2810850", nationality: "BEL" },
      { fullName: "Steven Lucas", dateOfBirth: "24/11/1970", passportNumber: "NP1FC3221", nationality: "NLD" },
    ],
    passengers: [],
  },
  {
    registration: "CS-LTO", direction: "ARRIVAL",
    crew: [
      { fullName: "Andor Cornel Schakel", dateOfBirth: "28/04/1973", passportNumber: "NRPDPDRB8", nationality: "NLD" },
      { fullName: "Damian Matias Scalcione Pelagatti", dateOfBirth: "21/06/1981", passportNumber: "PA0713532", nationality: "ESP" },
    ],
    passengers: [
      { fullName: "Adriana Petronella Maria Cornelia Pouw", dateOfBirth: "16/11/1946", passportNumber: "ITDKJ9JB8", nationality: "NLD" },
      { fullName: "Elisabeth Cunera Maria Pouw-van Verseveld", dateOfBirth: "25/05/1952", passportNumber: "IW8HC63P7", nationality: "NLD" },
      { fullName: "Jan van den Broek", dateOfBirth: "14/09/1944", passportNumber: "IW3KBJ6F4", nationality: "NLD" },
    ],
  },
  {
    registration: "9H-VFE", direction: "ARRIVAL",
    crew: [
      { fullName: "Eriksen, Henrik", dateOfBirth: "10/02/1972", passportNumber: "211079330", nationality: "DNK" },
      { fullName: "Durst, Amy Rose", dateOfBirth: "19/09/1991", passportNumber: "160774150", nationality: "GBR" },
      { fullName: "Negrini, Lucrezia", dateOfBirth: "18/03/1995", passportNumber: "YC5918121", nationality: "ITA" },
    ],
    passengers: [
      { fullName: "Schwarck, Philip Christopher", dateOfBirth: "07/05/1969", passportNumber: "210893990", nationality: "DNK" },
      { fullName: "Basse, Kaspar", dateOfBirth: "01/01/1971", passportNumber: "213828875", nationality: "DNK" },
      { fullName: "Kazibwe, Catherine", dateOfBirth: "25/05/1972", passportNumber: "142720214", nationality: "GBR" },
      { fullName: "Deery, Bryony Louise", dateOfBirth: "28/05/1992", passportNumber: "149982857", nationality: "GBR" },
      { fullName: "Basse, Elle", dateOfBirth: "16/12/2025", passportNumber: "156232543", nationality: "GBR" },
    ],
  },
  {
    registration: "CS-PHE", direction: "ARRIVAL",
    crew: [
      { fullName: "Russell Charles Traynor", dateOfBirth: "15/02/1972", passportNumber: "554591944", nationality: "GBR" },
      { fullName: "Joao Henrique Ferreira Maia", dateOfBirth: "14/05/1984", passportNumber: "CE784979", nationality: "PRT" },
    ],
    passengers: [
      { fullName: "Paul Carlile", dateOfBirth: "30/04/1955", passportNumber: "542371212", nationality: "GBR" },
      { fullName: "Dominique Jean-Marie Vandenweghe", dateOfBirth: "21/02/1968", passportNumber: "GC3735936", nationality: "BEL" },
    ],
  },
  {
    registration: "9H-ILY", direction: "ARRIVAL",
    crew: [
      { fullName: "Ellams, Antony", dateOfBirth: "18/07/1980", passportNumber: "534924314", nationality: "GBR" },
      { fullName: "Altamiranda, Alejandro Daniel", dateOfBirth: "13/05/1984", passportNumber: "YB2901652", nationality: "ITA" },
      { fullName: "Brooks, Caitlin", dateOfBirth: "03/06/2002", passportNumber: "PL5099449", nationality: "IRL" },
    ],
    passengers: [],
  },
  {
    registration: "CS-CHA", direction: "ARRIVAL",
    crew: [
      { fullName: "Christian Roed", dateOfBirth: "04/03/1977", passportNumber: "214661429", nationality: "DNK" },
      { fullName: "Loic Pierre-Yves Julien Denis", dateOfBirth: "26/02/1987", passportNumber: "19AA97418", nationality: "FRA" },
      { fullName: "Maria Vittoria Emiliani", dateOfBirth: "31/08/1984", passportNumber: "YB7690743", nationality: "ITA" },
    ],
    passengers: [],
  },
  {
    registration: "G-IASM", direction: "ARRIVAL",
    crew: [
      { fullName: "Jake Brookes", dateOfBirth: "10/02/1982", passportNumber: "536865552", nationality: "GBR", role: "CAPTAIN" },
      { fullName: "David Fuller", dateOfBirth: "29/11/1962", passportNumber: "139505818", nationality: "GBR", role: "FIRST_OFFICER" },
    ],
    passengers: [],
  },
  {
    registration: "9H-PFX", direction: "ARRIVAL",
    crew: [
      { fullName: "Giacomo Santilli", dateOfBirth: "30/03/1969", passportNumber: "YB0843636", nationality: "ITA" },
      { fullName: "Francisco Hernandez Franco", dateOfBirth: "27/08/1970", passportNumber: "PAU532336", nationality: "ESP" },
      { fullName: "Sarah Thomsen", dateOfBirth: "30/05/1983", passportNumber: "126175007", nationality: "GBR" },
    ],
    passengers: [],
  },
  {
    registration: "M-FWWW", direction: "ARRIVAL",
    crew: [
      { fullName: "Hosie William Blamires", dateOfBirth: "", passportNumber: "124423442", nationality: "GBR" },
    ],
    passengers: [
      { fullName: "Best Stephen", dateOfBirth: "19/01/1949", passportNumber: "127455126", nationality: "GBR" },
      { fullName: "Gatehouse Mark Alexander Vernon", dateOfBirth: "21/06/1949", passportNumber: "127991051", nationality: "GBR" },
      { fullName: "Lynch Liam Bernard", dateOfBirth: "11/10/1974", passportNumber: "PK7455369", nationality: "IRL" },
      { fullName: "Ian Mitchell", dateOfBirth: "03/05/1960", passportNumber: "143439293", nationality: "GBR" },
    ],
  },
  {
    registration: "SP-ZEN", direction: "ARRIVAL",
    crew: [
      { fullName: "Tomasz Prokop", dateOfBirth: "02/02/1985", passportNumber: "EK9716520", nationality: "POL" },
      { fullName: "Lukasz Stanislaw Pantula", dateOfBirth: "19/04/1985", passportNumber: "FA1546256", nationality: "POL" },
      { fullName: "Katarzyna Bendykowska", dateOfBirth: "24/09/1984", passportNumber: "FH2902959", nationality: "POL" },
    ],
    passengers: [
      { fullName: "Juan Mateu Bou", dateOfBirth: "21/11/1973", passportNumber: "CMP162795", nationality: "ESP" },
      { fullName: "Maria Magdalena Pascual Sancho", dateOfBirth: "07/12/1977", passportNumber: "CAG165350", nationality: "ESP" },
      { fullName: "OscarMichal Smolokowski", dateOfBirth: "12/08/1989", passportNumber: "EM6279514", nationality: "POL" },
      { fullName: "Wiaczeslaw Smolokowski", dateOfBirth: "21/11/1954", passportNumber: "FG8276138", nationality: "POL" },
    ],
  },
  {
    registration: "CS-LTD", direction: "ARRIVAL", // NJE924L — same crew, different flight (pernocta return)
    // Skip — already covered above. This is the evening arrival with same crew.
    crew: [],
    passengers: [
      { fullName: "Lukas Holzer", dateOfBirth: "11/03/2013", passportNumber: "L36K6YG3Y", nationality: "DEU" },
      { fullName: "Felix Holzer", dateOfBirth: "17/07/2010", passportNumber: "C36K3TFCR", nationality: "DEU" },
      { fullName: "Dominik Holzer", dateOfBirth: "09/03/1982", passportNumber: "C36KH1KZK", nationality: "DEU" },
    ],
  },

  // ── SALIDAS (Departures) ─────────────────────────────────────
  {
    registration: "D-BURO", direction: "DEPARTURE",
    crew: [
      { fullName: "Eggl, Markus Josef", dateOfBirth: "20/04/1984", passportNumber: "CFGNCXF17", nationality: "DEU" },
      { fullName: "Hartinger, Christoph", dateOfBirth: "20/10/1980", passportNumber: "CF8HML2LV", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Egger, Wolfgang Peter", dateOfBirth: "18/08/1965", passportNumber: "LGN4CCCMT", nationality: "DEU" },
      { fullName: "Wunderlich, Sabine Susanne", dateOfBirth: "01/07/1970", passportNumber: "CGN5MWCMY", nationality: "DEU" },
    ],
  },
  {
    registration: "CS-CHN", direction: "DEPARTURE",
    crew: [
      { fullName: "Guyon Sarlui", dateOfBirth: "12/11/1974", passportNumber: "NNH4C3H87", nationality: "NLD", role: "CAPTAIN" },
      { fullName: "Knut Taraldsen", dateOfBirth: "13/01/1977", passportNumber: "34614646", nationality: "NOR" },
      { fullName: "Kim Hudson", dateOfBirth: "12/06/1971", passportNumber: "128928350", nationality: "GBR" },
    ],
    passengers: [
      { fullName: "Eduardo Xavier Castro-Wright", dateOfBirth: "22/02/1955", passportNumber: "A25415102", nationality: "USA" },
      { fullName: "Fabiola de Castro", dateOfBirth: "01/10/1953", passportNumber: "A81554438", nationality: "USA" },
    ],
  },
  {
    registration: "D-ALIN", direction: "DEPARTURE",
    crew: [
      { fullName: "Radakovits, Michael", dateOfBirth: "02/09/1987", passportNumber: "U7542870", nationality: "AUT" },
      { fullName: "Mischker, Sebastian Maximilian Thomas", dateOfBirth: "27/06/1981", passportNumber: "C1T5VYLVT", nationality: "DEU" },
      { fullName: "Switala, Paulina", dateOfBirth: "20/09/1986", passportNumber: "C79VR7P2Y", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Morgan, Stephen Peter", dateOfBirth: "25/11/1952", passportNumber: "144824665", nationality: "GBR" },
      { fullName: "Morgan, Sally Julia", dateOfBirth: "31/10/1968", passportNumber: "124928285", nationality: "GBR" },
      { fullName: "Foulkes-Davies, Hugo Edward", dateOfBirth: "26/01/2010", passportNumber: "151531269", nationality: "GBR" },
    ],
  },
  {
    registration: "M-FROG", direction: "DEPARTURE",
    crew: [
      { fullName: "Lukas Wolfgang", dateOfBirth: "16/05/1958", passportNumber: "C4VMHWPFH", nationality: "DEU" },
      { fullName: "Krenn Thomas", dateOfBirth: "10/12/1964", passportNumber: "U4156947", nationality: "AUT" },
    ],
    passengers: [],
  },
  {
    registration: "D-CBCT", direction: "DEPARTURE",
    crew: [
      { fullName: "Geertz Lars Oliver", dateOfBirth: "07/11/1968", passportNumber: "L7K4CP9N6", nationality: "DEU" },
      { fullName: "Geertz Ben Lasse", dateOfBirth: "10/05/1999", passportNumber: "L7K43M7T7", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Hagedorn Thomas", dateOfBirth: "11/05/1971", passportNumber: "L7K82TLZG", nationality: "DEU" },
    ],
  },
  {
    registration: "SP-ZEN", direction: "DEPARTURE",
    crew: [
      { fullName: "Tomasz Prokop", dateOfBirth: "02/02/1985", passportNumber: "EK9716520", nationality: "POL" },
      { fullName: "Lukasz Stanislaw Pantula", dateOfBirth: "19/04/1985", passportNumber: "FA1546256", nationality: "POL" },
      { fullName: "Katarzyna Bendykowska", dateOfBirth: "24/09/1984", passportNumber: "FH2902959", nationality: "POL" },
    ],
    passengers: [
      { fullName: "Juan Mateu", dateOfBirth: "", passportNumber: "CMP162795", nationality: "ESP" },
      { fullName: "Maria Magdalena Pascual", dateOfBirth: "", passportNumber: "CAG165350", nationality: "ESP" },
      { fullName: "OscarMichal Smolokowski", dateOfBirth: "12/08/1989", passportNumber: "EM6279514", nationality: "POL" },
      { fullName: "Wiaczeslaw Smolokowski", dateOfBirth: "21/11/1954", passportNumber: "FG8276138", nationality: "POL" },
    ],
  },
  {
    registration: "D-IKGT", direction: "DEPARTURE",
    crew: [
      { fullName: "Theurer Karl-Georg", dateOfBirth: "24/12/1951", passportNumber: "C86HZGPRO", nationality: "DEU" },
      { fullName: "Ariane Markowski", dateOfBirth: "20/08/1961", passportNumber: "L1W5Z37FW", nationality: "DEU" },
    ],
    passengers: [],
  },
  {
    registration: "SP-OOK", direction: "DEPARTURE",
    crew: [
      { fullName: "Remigiusz Slugaj", dateOfBirth: "19/02/1995", passportNumber: "ES0450852", nationality: "POL" },
      { fullName: "Marcin Jakub Samek", dateOfBirth: "15/02/1978", passportNumber: "FB1627303", nationality: "POL" },
    ],
    passengers: [
      { fullName: "Olwen Catherine Woodrow", dateOfBirth: "31/03/1950", passportNumber: "142605224", nationality: "GBR" },
      { fullName: "Phillip Andrew Woodrow", dateOfBirth: "11/08/1947", passportNumber: "142903982", nationality: "GBR" },
    ],
  },
  {
    registration: "CS-LTB", direction: "DEPARTURE",
    crew: [
      { fullName: "Willem Jan Madsen", dateOfBirth: "21/09/1965", passportNumber: "BD146JP81", nationality: "NLD" },
      { fullName: "Andrew Watson", dateOfBirth: "02/06/1984", passportNumber: "560670102", nationality: "GBR" },
    ],
    passengers: [
      { fullName: "Karim El Barkawi", dateOfBirth: "09/09/1964", passportNumber: "LF8ZRP1ZP", nationality: "DEU" },
      { fullName: "Carena El Barkawi", dateOfBirth: "20/10/1962", passportNumber: "LF8Z6PF6H", nationality: "DEU" },
    ],
  },
  {
    registration: "OE-FNM", direction: "DEPARTURE",
    crew: [
      { fullName: "Virgile de Bussy", dateOfBirth: "08/05/1995", passportNumber: "21EF34686", nationality: "FRA" },
      { fullName: "Beat Steger", dateOfBirth: "22/02/1984", passportNumber: "X0M37B53", nationality: "CHE" },
    ],
    passengers: [
      { fullName: "Simone Emily Nanette Schorge-Brinkman", dateOfBirth: "27/07/1974", passportNumber: "NP66RP1F2", nationality: "NLD" },
      { fullName: "Jorg Uwe Schorge", dateOfBirth: "06/01/1950", passportNumber: "C7VF27M9T", nationality: "DEU" },
    ],
  },
  {
    registration: "OE-GPP", direction: "DEPARTURE",
    crew: [
      { fullName: "Florian Presenhuber-Krennmayr", dateOfBirth: "01/04/1989", passportNumber: "U7974012", nationality: "AUT" },
      { fullName: "Simon Pils", dateOfBirth: "14/05/2002", passportNumber: "AP0951432", nationality: "AUT" },
      { fullName: "Franziska Wloszkewicz", dateOfBirth: "14/02/1991", passportNumber: "C4VWLH841", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Martin Schlichting", dateOfBirth: "22/10/1967", passportNumber: "12285794", nationality: "AUT" },
      { fullName: "Michaela Schlichting", dateOfBirth: "02/11/1967", passportNumber: "12285793", nationality: "AUT" },
    ],
  },
  {
    registration: "OE-GLB", direction: "DEPARTURE",
    crew: [
      { fullName: "Frank Claessens", dateOfBirth: "27/01/1979", passportNumber: "C717C9VJY", nationality: "DEU" },
      { fullName: "Vasco Daniel Maia Miguel", dateOfBirth: "12/12/2002", passportNumber: "CF828980", nationality: "PRT" },
    ],
    passengers: [
      { fullName: "Mark Lavery", dateOfBirth: "27/07/1965", passportNumber: "550315659", nationality: "GBR" },
      { fullName: "Avril Palmer Lavery", dateOfBirth: "27/04/1964", passportNumber: "157212866", nationality: "GBR" },
    ],
  },
  {
    registration: "CS-LUB", direction: "DEPARTURE",
    crew: [
      { fullName: "Frederick Hugo Donato DEufemia", dateOfBirth: "27/05/1985", passportNumber: "144084048", nationality: "GBR" },
      { fullName: "Rodrigo Julian Donado Vara", dateOfBirth: "13/07/1976", passportNumber: "PAM553055", nationality: "ESP" },
    ],
    passengers: [
      { fullName: "Jack Christopher Cator", dateOfBirth: "03/05/1989", passportNumber: "156210985", nationality: "GBR" },
      { fullName: "Govinda Elizabeth Colan Mercado", dateOfBirth: "10/02/1987", passportNumber: "PP220105466", nationality: "PER" },
      { fullName: "Yulia Emidgia Mercado Diaz", dateOfBirth: "05/08/1951", passportNumber: "PP124573885", nationality: "PER" },
    ],
  },
  {
    registration: "CS-LTD", direction: "DEPARTURE", // NJE701R
    crew: [
      { fullName: "Nuno Pedro Alves Chermont Bandeira", dateOfBirth: "21/05/1985", passportNumber: "CB901409", nationality: "PRT" },
      { fullName: "Henrique Filipe Goncalves Granito", dateOfBirth: "16/12/1980", passportNumber: "CE743342", nationality: "PRT" },
    ],
    passengers: [
      { fullName: "Wolfgang Edmund Johannes Meiser", dateOfBirth: "14/04/1969", passportNumber: "L36YHM17T", nationality: "DEU" },
      { fullName: "Katharina Maria Meiser", dateOfBirth: "27/04/1980", passportNumber: "L34V8GNGJ", nationality: "DEU" },
    ],
  },
  {
    registration: "CS-LTE", direction: "DEPARTURE", // NJE237M
    crew: [
      { fullName: "Lieven M. Delamper", dateOfBirth: "31/03/1967", passportNumber: "GC2810850", nationality: "BEL" },
      { fullName: "Steven Lucas", dateOfBirth: "24/11/1970", passportNumber: "NP1FC3221", nationality: "NLD" },
    ],
    passengers: [
      { fullName: "Leticia Foncillas Garcia de La Mata", dateOfBirth: "09/06/1963", passportNumber: "05203163B", nationality: "ESP" },
      { fullName: "John Carl Hahn", dateOfBirth: "09/06/1958", passportNumber: "A37240873", nationality: "USA" },
    ],
  },
  {
    registration: "D-ISAG", direction: "DEPARTURE",
    crew: [
      { fullName: "Krupp, Marcel", dateOfBirth: "09/06/1971", passportNumber: "C3LRV2YLF", nationality: "DEU" },
      { fullName: "Moghaddam Nia, Elias", dateOfBirth: "13/07/1988", passportNumber: "C1T588H9W", nationality: "DEU" },
    ],
    passengers: [
      { fullName: "Schulz, Matthias", dateOfBirth: "01/02/1961", passportNumber: "C208C764T", nationality: "DEU" },
      { fullName: "Schulz, Isabell", dateOfBirth: "09/07/1972", passportNumber: "C208C7PL1", nationality: "DEU" },
    ],
  },
  {
    registration: "CS-LTO", direction: "DEPARTURE", // NJE486N
    crew: [
      { fullName: "Andor Cornel Schakel", dateOfBirth: "28/04/1973", passportNumber: "NRPDPDRB8", nationality: "NLD" },
      { fullName: "Damian Matias Scalcione Pelagatti", dateOfBirth: "21/06/1981", passportNumber: "PA0713532", nationality: "ESP" },
    ],
    passengers: [],
  },
  {
    registration: "CS-PHE", direction: "DEPARTURE", // NJE280G
    crew: [
      { fullName: "Russell Charles Traynor", dateOfBirth: "15/02/1972", passportNumber: "554591944", nationality: "GBR" },
      { fullName: "Joao Henrique Ferreira Maia", dateOfBirth: "14/05/1984", passportNumber: "CE784979", nationality: "PRT" },
    ],
    passengers: [],
  },
  {
    registration: "9H-VFE", direction: "DEPARTURE", // VJT569
    crew: [
      { fullName: "Eriksen, Henrik", dateOfBirth: "10/02/1972", passportNumber: "211079330", nationality: "DNK" },
      { fullName: "Durst, Amy Rose", dateOfBirth: "19/09/1991", passportNumber: "160774150", nationality: "GBR" },
      { fullName: "Negrini, Lucrezia", dateOfBirth: "18/03/1995", passportNumber: "YC5918121", nationality: "ITA" },
    ],
    passengers: [],
  },
  {
    registration: "OK-DMK", direction: "DEPARTURE", // BOH411
    crew: [
      { fullName: "Jiri Macola", dateOfBirth: "12/09/1979", passportNumber: "45937312", nationality: "CZE" },
      { fullName: "Miroslav Pibil", dateOfBirth: "04/05/1989", passportNumber: "49421085", nationality: "CZE" },
      { fullName: "Dominika Fain", dateOfBirth: "15/01/1991", passportNumber: "BG1936082", nationality: "SVK" },
    ],
    passengers: [
      { fullName: "Andrew Harry Brakewell", dateOfBirth: "14/04/1964", passportNumber: "310134346", nationality: "GBR" },
      { fullName: "Elvira Dubinina", dateOfBirth: "14/10/1989", passportNumber: "893813.0", nationality: "RUS" },
    ],
  },
];

// Normalize registration: uppercase, no dashes, no spaces
function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/[-\s]/g, "");
}

async function main() {
  // Find 13 April DaySheet
  const targetDate = new Date(2026, 3, 13); // April = month 3
  targetDate.setHours(0, 0, 0, 0);

  let daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
  if (!daySheet) {
    daySheet = await prisma.daySheet.create({ data: { date: targetDate } });
    console.log("Created DaySheet for 13/04/2026");
  }

  // Load flights from target day + neighboring days (pernoctas)
  const prevDate = new Date(targetDate); prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(targetDate); nextDate.setDate(nextDate.getDate() + 1);

  const allFlights = await prisma.flight.findMany({
    where: {
      daySheet: { date: { in: [prevDate, targetDate, nextDate] } },
    },
    include: { passengers: true, crewMembers: true, daySheet: true },
  });

  // Build lookup: normalized reg → flight (prefer target day, then neighbors)
  const flightByNormReg = new Map<string, typeof allFlights[0]>();
  // First pass: neighbor days (lower priority)
  for (const f of allFlights) {
    if (f.daySheet.date.getTime() !== targetDate.getTime()) {
      const norm = normalizeReg(f.registration);
      if (!flightByNormReg.has(norm)) flightByNormReg.set(norm, f);
    }
  }
  // Second pass: target day (higher priority — overwrites neighbors)
  for (const f of allFlights) {
    if (f.daySheet.date.getTime() === targetDate.getTime()) {
      flightByNormReg.set(normalizeReg(f.registration), f);
    }
  }

  // Also index by callsign (normalized) for fallback matching
  const flightByCallsign = new Map<string, typeof allFlights[0]>();
  for (const f of allFlights) {
    if (f.daySheet.date.getTime() === targetDate.getTime()) {
      flightByCallsign.set(f.callsign.toUpperCase().replace(/[*\s]/g, ""), f);
    }
  }

  let crewCreated = 0;
  let paxCreated = 0;
  let matched = 0;
  let created = 0;

  for (const entry of gendecData) {
    const normReg = normalizeReg(entry.registration);

    let flight = flightByNormReg.get(normReg) || null;

    // Fallback: try callsign match if a callsign was provided in the data
    if (!flight) {
      // Try finding by registration substring (e.g., DB has "CSLTE" and we search "CS-LTE")
      for (const [key, f] of flightByNormReg) {
        if (key === normReg || normalizeReg(f.registration) === normReg) {
          flight = f;
          break;
        }
      }
    }

    // Still not found: create a placeholder flight on this DaySheet
    if (!flight) {
      const placeholder = await prisma.flight.create({
        data: {
          daySheetId: daySheet.id,
          callsign: "---",
          registration: entry.registration,
          aircraftType: "---",
          state: "EXPECTED",
        },
        include: { passengers: true, crewMembers: true, daySheet: true },
      });
      flightByNormReg.set(normReg, placeholder);
      flight = placeholder;
      created++;
      console.log(`  + ${entry.registration}: created placeholder flight`);
    }

    // Skip if already has crew/pax for this direction
    const existingCrew = flight.crewMembers.filter((c) => c.direction === entry.direction);
    const existingPax = flight.passengers.filter((p) => p.direction === entry.direction);
    if (existingCrew.length > 0 || existingPax.length > 0) {
      console.log(`  ⊘ ${entry.registration} (${entry.direction}): already has data — skipping`);
      continue;
    }

    matched++;

    for (const c of entry.crew) {
      if (!c.fullName) continue;
      await prisma.crewMember.create({
        data: {
          flightId: flight.id,
          direction: entry.direction,
          fullName: c.fullName,
          dateOfBirth: c.dateOfBirth || null,
          passportNumber: c.passportNumber || null,
          nationality: c.nationality || null,
          role: c.role || "OTHER",
        },
      });
      crewCreated++;
    }

    for (const p of entry.passengers) {
      if (!p.fullName) continue;
      await prisma.passenger.create({
        data: {
          flightId: flight.id,
          direction: entry.direction,
          fullName: p.fullName,
          dateOfBirth: p.dateOfBirth || null,
          passportNumber: p.passportNumber || null,
          nationality: p.nationality || null,
          status: p.status || "CONFIRMED",
        },
      });
      paxCreated++;
    }

    console.log(`  ✓ ${entry.registration} (${entry.direction}): ${entry.crew.length} crew, ${entry.passengers.length} pax`);
  }

  console.log(`\nGenDec seed complete: ${matched} flights matched, ${created} placeholders created, ${crewCreated} crew, ${paxCreated} pax`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
