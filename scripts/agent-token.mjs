// agent-token.mjs — CLI mínimo para las credenciales MCP del rol AGENT.
// Sprint 01 mcp-lectura (19-07-2026). Sin tests (fuera del test plan).
//
// El token en claro se muestra UNA sola vez al crearlo; en BD vive solo su
// hash sha256. Revocar = poner revokedAt (no se borra: queda la trazabilidad).
//
// Uso (env: TURSO_DATABASE_URL/TURSO_AUTH_TOKEN en Vercel, o DATABASE_URL local):
//   node scripts/agent-token.mjs create <name>     # p.ej. claude-code-la-bestia
//   node scripts/agent-token.mjs revoke <name|id>
//   node scripts/agent-token.mjs list
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const AGENT_EMAIL = "agent-claude@mallorcair.com";
const AGENT_NAME = "agent-claude";

function makePrisma() {
  // Mismo criterio que src/lib/db.ts: Turso (Vercel) vía adapter, si no SQLite local.
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

async function ensureAgentUser(prisma) {
  // El AGENT nunca inicia sesión: password aleatorio no-bcrypt (jamás casará).
  return prisma.user.upsert({
    where: { email: AGENT_EMAIL },
    update: { role: "AGENT" },
    create: {
      email: AGENT_EMAIL,
      name: AGENT_NAME,
      password: randomBytes(32).toString("hex"),
      role: "AGENT",
    },
  });
}

async function create(prisma, name) {
  if (!name) throw new Error("Falta <name>. Uso: agent-token create <name>");
  const user = await ensureAgentUser(prisma);
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.agentToken.create({
    data: { name, tokenHash, userId: user.id },
  });
  console.log("✅ Token creado (guárdalo AHORA, no se vuelve a mostrar):\n");
  console.log(`  id:    ${record.id}`);
  console.log(`  name:  ${record.name}`);
  console.log(`  token: ${token}\n`);
  console.log("Úsalo como  Authorization: Bearer <token>  contra POST /api/mcp");
}

async function revoke(prisma, ref) {
  if (!ref) throw new Error("Falta <name|id>. Uso: agent-token revoke <name|id>");
  const now = new Date();
  const byId = await prisma.agentToken.findUnique({ where: { id: ref } });
  if (byId) {
    if (byId.revokedAt) {
      console.log(`⊘ Ya estaba revocado: ${byId.id} (${byId.name})`);
      return;
    }
    await prisma.agentToken.update({ where: { id: byId.id }, data: { revokedAt: now } });
    console.log(`✅ Revocado: ${byId.id} (${byId.name})`);
    return;
  }
  const res = await prisma.agentToken.updateMany({
    where: { name: ref, revokedAt: null },
    data: { revokedAt: now },
  });
  if (res.count === 0) {
    console.log(`(nada que revocar para "${ref}")`);
  } else {
    console.log(`✅ Revocados ${res.count} token(s) con name="${ref}"`);
  }
}

async function list(prisma) {
  const tokens = await prisma.agentToken.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
  });
  if (tokens.length === 0) {
    console.log("(sin tokens)");
    return;
  }
  for (const t of tokens) {
    const status = t.revokedAt ? `REVOKED ${t.revokedAt.toISOString()}` : "active";
    const used = t.lastUsedAt ? t.lastUsedAt.toISOString() : "never";
    console.log(
      `${t.id}  ${t.name.padEnd(24)}  ${status.padEnd(30)}  last=${used}  user=${t.user?.name ?? "?"}`
    );
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const prisma = makePrisma();
  try {
    switch (cmd) {
      case "create":
        await create(prisma, arg);
        break;
      case "revoke":
        await revoke(prisma, arg);
        break;
      case "list":
        await list(prisma);
        break;
      default:
        console.log("Uso: node scripts/agent-token.mjs <create <name> | revoke <name|id> | list>");
        process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("✗", e.message || e);
  process.exit(1);
});
