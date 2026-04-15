import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/setup|_next|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
