// Force tests to run as if the host were in Europe/Madrid (Palma).
// This catches the Zulu-vs-local bugs that the production user base would hit.
process.env.TZ = "Europe/Madrid";
