import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // /api/setup is intentionally excluded from NextAuth middleware: it does
    // its own X-Setup-Secret check so it can be invoked before any user exists.
    "/((?!login|api/auth|api/setup|_next|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
