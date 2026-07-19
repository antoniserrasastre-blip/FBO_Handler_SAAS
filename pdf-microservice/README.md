# pdf-microservice

Express microservice that receives handler PDFs over HTTP and returns
structured JSON. Designed to run on a local server (sirvici), next to the
self-hosted Next.js app (same host; the Vercel/Turso second deploy target
reaches it via Cloudflare Tunnel).

## Endpoints

### `POST /parse/netjets`

Accepts `multipart/form-data` with a `pdf` field (the NetJets ALS
"Handling Logistics Report" PDF) and returns the parsed flight list.

```bash
curl -X POST http://localhost:3001/parse/netjets \
  -F "pdf=@./report.pdf"
```

### `GET /health`

Liveness check.

## Run

```bash
npm install
npm start            # production
npm run dev          # auto-restart on file changes
PORT=4000 npm start  # custom port (default 3001)
```

## Tests

```bash
npm test
```

Uses Node's built-in test runner against the real fixture under
`src/parsers/__tests__/fixtures/netjets_sample.pdf`.

## Architecture

- `src/server.js` — Express bootstrap.
- `src/routes/parse.js` — multer upload + per-vendor route.
- `src/parsers/netjets.js` — NetJets ALS parser (coordinate-based via
  `pdfjs-dist@^4` legacy build).

The NetJets PDF uses a transposed table layout (field labels in a vertical
column on the left, each person as its own vertical column to the right,
multiple flights stacked horizontally per page). The parser extracts text
items with x/y coordinates, detects flight anchors from the Rqst # row,
detects person columns from the DOB / Doc Number rows, then reads each cell
by assigning items to their nearest anchor across the entire page. See the
file header in `src/parsers/netjets.js` for full details on the edge cases
handled (Steinbrugg+er overflow chunks, NID with embedded number, country
with embedded expiry, pets, ferry/cancelled flights).
