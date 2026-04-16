#!/bin/bash
# Runs during Vercel build: creates tables + seeds data into Turso
# Only executes if TURSO env vars are present, otherwise skips silently

if [ -z "$TURSO_DATABASE_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
  echo "No TURSO env vars — skipping DB setup"
  exit 0
fi

echo "=== Turso DB Setup ==="

echo "1/4 Pushing schema..."
npx tsx scripts/push-turso-schema.ts

echo "2/4 Seeding users..."
npx tsx scripts/setup-turso.ts

echo "3/4 Seeding flights + services from docs..."
npx tsx scripts/seed-from-docs.ts

echo "4/4 Seeding crew + passengers from GenDec..."
npx tsx scripts/seed-gendec-13apr.ts

echo "=== DB Setup Complete ==="
