import { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/rbac/access";

// Role ditarik dari lib/rbac/access.ts, bukan diketik ulang di sini. Union yang
// disalin akan menyimpang begitu ada role baru, dan gejalanya bukan galat tipe
// melainkan role yang tidak pernah cocok dengan apa pun.
//
// Izin SENGAJA tidak ikut disimpan di session/JWT: token di sini stateless dan
// berumur panjang, jadi izin yang tersimpan di dalamnya akan tetap berlaku
// setelah dicabut, sampai tokennya kedaluwarsa. Izin selalu dibaca segar dari
// database - lihat requireAdminSession() di lib/auth/admin-gate.ts.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      updatedAt: number;
    } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    updatedAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    updatedAt?: number;
  }
}
