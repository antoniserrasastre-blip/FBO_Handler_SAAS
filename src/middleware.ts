import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // /api/setup and /api/db/* are intentionally excluded from NextAuth
    // middleware: they do their own X-Setup-Secret check so they can be invoked
    // before any user exists / to materialise the schema on first deploy.
    // /api/mcp is the agent surface: it does its own AgentToken Bearer check
    // (fail-closed 401) — a NextAuth redirect-to-login would break MCP clients.
    "/((?!login|api/auth|api/setup|api/db|api/mcp|_next|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
