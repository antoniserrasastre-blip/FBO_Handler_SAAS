import express from 'express';
import parseRouter from './routes/parse.js';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/parse', parseRouter);

app.listen(port, () => {
  console.log(`pdf-microservice listening on :${port}`);
});
