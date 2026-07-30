import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      updatedAt: number;
    } & DefaultSession["user"];
  }
  interface User {
    role: "USER" | "ADMIN";
    updatedAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
    updatedAt?: number;
  }
}
