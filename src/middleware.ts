import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, and static files
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
