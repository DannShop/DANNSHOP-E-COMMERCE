import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;

  if (nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.role !== "ADMIN") {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }

  if (nextUrl.pathname.startsWith("/account")) {
    if (!user) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
