// migrationDrift.test.ts — Anti-drift guard for schema ↔ migration SQL.
//
// Reads both source files as plain text and asserts that every column name
// present in schema.prisma is either:
//   a) present in a CREATE TABLE block inside migrate-v2-schema.mjs, or
//   b) present in a V2_ALTERS ALTER TABLE ... ADD COLUMN statement.
//
// This will FAIL in CI if someone adds a column to schema.prisma without
// updating the migration script.  That is exactly the goal.
//
// The test also verifies that:
//   - The Visit unique index (aircraftId, palmaDay) is present.
//   - Key new columns (AENA fields, commercialFlag, isStateAircraft, ata/atd)
//     appear in the migration SQL.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

const schemaSrc = fs.readFileSync(
  path.join(REPO_ROOT, "prisma/schema.prisma"),
  "utf8"
);
const migrateSrc = fs.readFileSync(
  path.join(REPO_ROOT, "scripts/migrate-v2-schema.mjs"),
  "utf8"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all column names (camelCase identifiers) from a Prisma model block.
 * Only collects lines that look like field definitions (start with a word
 * character after optional whitespace, and are not directives like @@index).
 */
function extractPrismaFieldNames(modelBlock: string): string[] {
  const names: string[] = [];
  for (const line of modelBlock.split("\n")) {
    const trimmed = line.trim();
    // Skip blank, comments, directives and relation-only fields that
    // don't produce DB columns (e.g. "aircraft Aircraft @relation(...)").
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;
    const match = trimmed.match(/^(\w+)\s+/);
    if (!match) continue;
    const fieldName = match[1];
    // Skip Prisma keywords that are not field names
    if (["model", "generator", "datasource", "enum", "type"].includes(fieldName)) continue;
    names.push(fieldName);
  }
  return names;
}

/**
 * Extract a model block from schema.prisma source.
 */
function extractModelBlock(schema: string, modelName: string): string | null {
  const re = new RegExp(`model\\s+${modelName}\\s*\\{([^}]+)\\}`, "s");
  const m = schema.match(re);
  return m ? m[1] : null;
}

/**
 * Returns true when colName appears inside the migration SQL — either in a
 * CREATE TABLE block for tableName or in an ALTER TABLE tableName ADD COLUMN
 * statement.
 */
function columnIsCovered(migrateSql: string, tableName: string, colName: string): boolean {
  // In CREATE TABLE: look for `"colName"` anywhere in the block
  const createRe = new RegExp(
    `CREATE TABLE IF NOT EXISTS "${tableName}"[^;]+?"${colName}"`,
    "s"
  );
  if (createRe.test(migrateSql)) return true;

  // In ALTER TABLE: ALTER TABLE "tableName" ADD COLUMN "colName"
  const alterRe = new RegExp(
    `ALTER TABLE "${tableName}" ADD COLUMN "${colName}"`,
    "s"
  );
  if (alterRe.test(migrateSql)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Columns known to be Prisma relation fields (no DB column produced)
// ---------------------------------------------------------------------------
const RELATION_FIELDS: Record<string, Set<string>> = {
  User: new Set(["eventLogs", "assignedVisits", "servicePresets", "shifts"]),
  DaySheet: new Set([]),
  Operator: new Set(["aircraft", "visits", "crewMembers"]),
  Aircraft: new Set(["currentOperator", "visits"]),
  Visit: new Set(["aircraft", "operator", "movements", "services", "lostItems", "eventLogs", "assignedTo", "crewItems"]),
  Movement: new Set(["visit", "passengers", "crewAssignments", "eventLogs", "tasks"]),
  Service: new Set(["visit"]),
  Passenger: new Set(["movement"]),
  CrewMember: new Set(["operator", "assignments"]),
  CrewAssignment: new Set(["movement", "crewMember"]),
  LostItem: new Set(["visit"]),
  EventLog: new Set(["visit", "movement", "user"]),
};

// Prisma-only meta-fields that don't map to SQL columns
const PRISMA_META = new Set(["id", "createdAt", "updatedAt", "timestamp"]);

// Models whose table name in SQL matches the model name 1:1
const MODELS_TO_CHECK: Array<{ prismaModel: string; sqlTable: string }> = [
  { prismaModel: "User", sqlTable: "User" },
  { prismaModel: "DaySheet", sqlTable: "DaySheet" },
  { prismaModel: "Operator", sqlTable: "Operator" },
  { prismaModel: "Aircraft", sqlTable: "Aircraft" },
  { prismaModel: "Visit", sqlTable: "Visit" },
  { prismaModel: "Movement", sqlTable: "Movement" },
  { prismaModel: "Service", sqlTable: "Service" },
  { prismaModel: "Passenger", sqlTable: "Passenger" },
  { prismaModel: "CrewMember", sqlTable: "CrewMember" },
  { prismaModel: "CrewAssignment", sqlTable: "CrewAssignment" },
  { prismaModel: "LostItem", sqlTable: "LostItem" },
  { prismaModel: "EventLog", sqlTable: "EventLog" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Migration drift guard — schema.prisma vs migrate-v2-schema.mjs", () => {
  for (const { prismaModel, sqlTable } of MODELS_TO_CHECK) {
    describe(`Model: ${prismaModel}`, () => {
      const block = extractModelBlock(schemaSrc, prismaModel);

      it(`has a model block in schema.prisma`, () => {
        expect(block).not.toBeNull();
      });

      if (!block) return;

      const fieldNames = extractPrismaFieldNames(block);
      const relations = RELATION_FIELDS[prismaModel] ?? new Set<string>();

      // Filter down to actual DB column names: skip relation fields and
      // well-known meta columns that are always present in CREATE TABLE.
      const columnFields = fieldNames.filter(
        (f) => !relations.has(f) && !PRISMA_META.has(f)
      );

      for (const col of columnFields) {
        it(`column "${col}" is covered by CREATE TABLE or ALTER TABLE in the migration`, () => {
          const covered = columnIsCovered(migrateSrc, sqlTable, col);
          expect(covered, `"${prismaModel}.${col}" is missing from migrate-v2-schema.mjs`).toBe(true);
        });
      }
    });
  }

  describe("Critical new columns are present in migration", () => {
    it("Operator.isStateAircraft", () => {
      expect(migrateSrc).toContain('"isStateAircraft"');
    });
    it("Aircraft.mtowKg", () => {
      expect(migrateSrc).toContain('"mtowKg"');
    });
    it("Aircraft.noiseChapter", () => {
      expect(migrateSrc).toContain('"noiseChapter"');
    });
    it("Aircraft.cumulativeMarginEpndb", () => {
      expect(migrateSrc).toContain('"cumulativeMarginEpndb"');
    });
    it("Aircraft.paxCapacityCertified", () => {
      expect(migrateSrc).toContain('"paxCapacityCertified"');
    });
    it("Aircraft.aircraftDataConfirmed", () => {
      expect(migrateSrc).toContain('"aircraftDataConfirmed"');
    });
    it("Aircraft.aircraftDataConfirmedById", () => {
      expect(migrateSrc).toContain('"aircraftDataConfirmedById"');
    });
    it("Aircraft.aircraftDataConfirmedAt", () => {
      expect(migrateSrc).toContain('"aircraftDataConfirmedAt"');
    });
    it("Movement.ata", () => {
      expect(migrateSrc).toContain('"ata"');
    });
    it("Movement.atd", () => {
      expect(migrateSrc).toContain('"atd"');
    });
    it("Movement.commercialFlag", () => {
      expect(migrateSrc).toContain('"commercialFlag"');
    });
    it("DaySheet.notes", () => {
      expect(migrateSrc).toContain('"notes"');
    });
    it("DaySheet.closed", () => {
      expect(migrateSrc).toContain('"closed"');
    });
  });

  describe("Visit unique index is present in migration", () => {
    it('CREATE UNIQUE INDEX for (aircraftId, palmaDay)', () => {
      expect(migrateSrc).toContain('"Visit_aircraftId_palmaDay_key"');
      expect(migrateSrc).toContain('ON "Visit"("aircraftId","palmaDay")');
    });
  });

  describe("DaySheet V2 table is recreated (not just dropped)", () => {
    it('CREATE TABLE IF NOT EXISTS "DaySheet" is present in V2_TABLES', () => {
      expect(migrateSrc).toContain('CREATE TABLE IF NOT EXISTS "DaySheet"');
    });
  });
});
