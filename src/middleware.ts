import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // /api/setup and /api/db/migrate are intentionally excluded from NextAuth
    // middleware: they do their own X-Setup-Secret check so they can be invoked
    // before any user exists / to materialise the schema on first deploy.
    "/((?!login|api/auth|api/setup|api/db/migrate|_next|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
