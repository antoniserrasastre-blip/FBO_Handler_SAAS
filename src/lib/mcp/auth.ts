import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AgentAuth } from "./contract";

/**
 * Verifica el header Authorization ("Bearer <token>") contra AgentToken
 * (hash sha256 hex, revokedAt == null). Devuelve null si no autoriza.
 *
 * Efecto colateral permitido (y ÚNICO): actualizar lastUsedAt del token válido.
 * Se hace fire-and-forget para que un fallo de escritura de telemetría nunca
 * tumbe una autenticación por lo demás válida.
 */
export async function verifyAgentToken(
  authHeader: string | null
): Promise<AgentAuth | null> {
  if (!authHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const record = await prisma.agentToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.revokedAt !== null) return null;

  // Sella el uso — data SOLO { lastUsedAt } (invariante: las lecturas no
  // escriben nada más). Fire-and-forget: no bloquea ni hace fallar la request.
  void prisma.agentToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    tokenId: record.id,
    userId: record.userId,
    userName: record.user?.name ?? "",
  };
}
