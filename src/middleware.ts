import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, static files, and public assets
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
