import express from 'express';
import { bearerAuth } from './middleware/auth.js';
import { initDb } from './db/client.js';
import aircraftRouter from './routes/aircraft.js';
import calculateRouter from './routes/calculate.js';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

app.use(express.json({ limit: '256kb' }));

// Public liveness probe (no auth).
app.get('/health', (_req, res) => res.json({ ok: true, service: 'aena-microservice' }));

// Everything below requires the shared bearer token.
app.use(bearerAuth);

app.use('/aircraft', aircraftRouter);
app.use('/calculate', calculateRouter);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[aena-microservice] unhandled', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

initDb();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`aena-microservice listening on :${port}`);
});
