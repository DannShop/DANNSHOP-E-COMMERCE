import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTE_RULES,
  canAccessAdminPath,
  canEnterAdmin,
  firstAllowedAdminPath,
  hasPermission,
  type AdminViewer,
} from "@/lib/rbac/access";
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  groupedPermissions,
  isValidPermission,
  parsePermissions,
  type Permission,
} from "@/lib/rbac/permissions";
import { NAV_GROUPS } from "@/app/admin/nav-config";

const owner: AdminViewer = { role: "ADMIN", permissions: [] };
const buyer: AdminViewer = { role: "USER", permissions: [] };
const staff = (...permissions: Permission[]): AdminViewer => ({ role: "STAFF", permissions });

describe("katalog izin", () => {
  it("tiap izin punya entri katalog, dan sebaliknya", () => {
    expect(PERMISSION_CATALOG.map((p) => p.key).sort()).toEqual([...PERMISSIONS].sort());
  });

  it("tidak ada key ganda", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mengelompokkan tanpa kehilangan satu pun izin", () => {
    const flat = groupedPermissions().flatMap((g) => g.items.map((i) => i.key));
    expect(flat.sort()).toEqual([...PERMISSIONS].sort());
  });

  // Izin yang menyentuh uang/akun HARUS ditandai, karena penandanya yang membuat
  // admin melihat bedanya saat mencentang buru-buru.
  it("menandai izin uang & akun sebagai sensitif", () => {
    const sensitive = PERMISSION_CATALOG.filter((p) => p.sensitive).map((p) => p.key);
    expect(sensitive).toContain("orders.refund");
    expect(sensitive).toContain("users.manage");
  });
});

describe("parsePermissions", () => {
  it("membuang key yang tidak dikenal, bukan meloloskannya", () => {
    expect(parsePermissions(["orders.view", "admin.everything", 42, null])).toEqual(["orders.view"]);
  });

  it("mengembalikan daftar kosong untuk nilai yang bukan array", () => {
    for (const bad of [null, undefined, "orders.view", 7, {}]) {
      expect(parsePermissions(bad)).toEqual([]);
    }
  });

  it("membuang duplikat", () => {
    expect(parsePermissions(["orders.view", "orders.view"])).toEqual(["orders.view"]);
  });

  it("isValidPermission menolak yang mirip tapi bukan", () => {
    expect(isValidPermission("orders.view")).toBe(true);
    expect(isValidPermission("orders.View")).toBe(false);
    expect(isValidPermission("orders")).toBe(false);
  });
});

describe("hasPermission", () => {
  // Pemilik toko tidak boleh bisa mengunci dirinya sendiri di luar panelnya.
  it("ADMIN lolos semua izin walau daftarnya kosong", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(owner, permission)).toBe(true);
    }
  });

  it("USER tidak pernah lolos, walau daftarnya diisi", () => {
    const impostor: AdminViewer = { role: "USER", permissions: [...PERMISSIONS] };
    expect(hasPermission(impostor, "orders.view")).toBe(false);
  });

  it("STAFF hanya lolos yang dicentang", () => {
    const cs = staff("orders.view");
    expect(hasPermission(cs, "orders.view")).toBe(true);
    expect(hasPermission(cs, "orders.refund")).toBe(false);
  });
});

describe("canEnterAdmin", () => {
  it("hanya ADMIN & STAFF", () => {
    expect(canEnterAdmin("ADMIN")).toBe(true);
    expect(canEnterAdmin("STAFF")).toBe(true);
    expect(canEnterAdmin("USER")).toBe(false);
    expect(canEnterAdmin(undefined)).toBe(false);
  });
});

describe("canAccessAdminPath", () => {
  it("ADMIN boleh ke mana saja", () => {
    for (const rule of ADMIN_ROUTE_RULES) {
      expect(canAccessAdminPath(owner, rule.prefix)).toBe(true);
    }
  });

  it("pembeli tidak boleh ke mana pun di panel", () => {
    for (const rule of ADMIN_ROUTE_RULES) {
      expect(canAccessAdminPath(buyer, rule.prefix)).toBe(false);
    }
  });

  // INI pemisahan uangnya. CS boleh membuka daftar pesanan; halaman itu sama,
  // yang berbeda aksinya - dan aksinya digerbang terpisah di orders.ts.
  it("memberi akses halaman pesanan tanpa memberi akses keuangan", () => {
    const cs = staff("orders.view");
    expect(canAccessAdminPath(cs, "/admin/orders")).toBe(true);
    expect(canAccessAdminPath(cs, "/admin/orders/INV-123")).toBe(true);
    expect(canAccessAdminPath(cs, "/admin/reports")).toBe(false);
    expect(canAccessAdminPath(cs, "/admin/wallet-ledger")).toBe(false);
  });

  it("route bersarang ikut aturan induknya", () => {
    const katalog = staff("catalog.manage");
    expect(canAccessAdminPath(katalog, "/admin/products/import")).toBe(true);
    expect(canAccessAdminPath(katalog, "/admin/products/abc123")).toBe(true);
  });

  // Kalau ini bocor, karyawan bisa menaikkan izinnya sendiri sampai setara
  // pemilik toko - dan tidak ada satu pun error yang menandainya.
  it("Karyawan & Peran TERTUTUP untuk staff, seberapa pun lengkap izinnya", () => {
    const superStaff = staff(...PERMISSIONS);
    expect(canAccessAdminPath(superStaff, "/admin/staff")).toBe(false);
    expect(canAccessAdminPath(owner, "/admin/staff")).toBe(true);
  });

  // Gerbang 2FA mewajibkan karyawan memasang 2FA sebelum bisa ke mana-mana, dan
  // satu-satunya tempat memasangnya ada di halaman itu. Menggerbangnya =
  // mengunci setiap karyawan baru di luar panel, permanen.
  it("halaman keamanan akun selalu terbuka untuk karyawan tanpa izin apa pun", () => {
    expect(canAccessAdminPath(staff(), "/admin/keamanan")).toBe(true);
    expect(canAccessAdminPath(staff(), "/admin/panduan")).toBe(true);
  });

  it("dashboard diperlakukan sebagai data keuangan", () => {
    expect(canAccessAdminPath(staff("orders.view"), "/admin")).toBe(false);
    expect(canAccessAdminPath(staff("finance.view"), "/admin")).toBe(true);
  });

  // Bawaan yang salah-arah harus MENUTUP, bukan membuka.
  it("halaman admin yang belum didaftarkan tidak terbuka begitu saja", () => {
    expect(canAccessAdminPath(staff("catalog.manage"), "/admin/halaman-baru")).toBe(false);
  });

  it("tidak mencampuri route di luar panel", () => {
    expect(canAccessAdminPath(buyer, "/account")).toBe(true);
    expect(canAccessAdminPath(buyer, "/")).toBe(true);
  });
});

describe("firstAllowedAdminPath", () => {
  it("mengantar karyawan ke halaman yang memang boleh dia buka", () => {
    const target = firstAllowedAdminPath(staff("catalog.manage"));
    expect(canAccessAdminPath(staff("catalog.manage"), target)).toBe(true);
    expect(target).toBe("/admin/products");
  });

  // Tanpa jaring ini, karyawan tanpa izin akan dialihkan ke halaman yang
  // menolaknya lagi - berputar tanpa henti.
  it("selalu mengembalikan tujuan yang BOLEH dibuka, termasuk untuk izin nol", () => {
    const nobody = staff();
    const target = firstAllowedAdminPath(nobody);
    expect(canAccessAdminPath(nobody, target)).toBe(true);
  });

  it("ADMIN tetap mendarat di dashboard", () => {
    expect(firstAllowedAdminPath(owner)).toBe("/admin");
  });

  it("tidak pernah mengantar karyawan ke halaman khusus pemilik", () => {
    for (const permission of PERMISSIONS) {
      expect(firstAllowedAdminPath(staff(permission))).not.toBe("/admin/staff");
    }
  });
});

// Menu dan gerbang route WAJIB memakai sumber yang sama. Kalau menyimpang,
// gejalanya menu yang terlihat tapi selalu menolak saat diklik - atau lebih
// buruk, menu tersembunyi untuk halaman yang sebenarnya boleh dibuka.
describe("menu sidebar vs aturan route", () => {
  it("setiap menu punya aturan aksesnya sendiri, bukan menumpang aturan /admin", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      if (item.href === "/admin") continue;
      const punyaAturan = ADMIN_ROUTE_RULES.some((rule) => rule.prefix === item.href);
      expect(punyaAturan, `menu ${item.href} belum didaftarkan di ADMIN_ROUTE_RULES`).toBe(true);
    }
  });

  // Bahwa sidebar benar-benar MENYARING sesuai aturan ini diuji dengan
  // merendernya, di tests/components/admin-sidebar.test.tsx.
  it("tiap grup menu menyisakan sesuatu untuk setidaknya satu peran", () => {
    // Grup yang seluruh isinya mustahil dibuka siapa pun berarti ada izin yang
    // hilang dari katalog - menunya akan selamanya tersembunyi tanpa ada yang
    // menyadarinya.
    for (const group of NAV_GROUPS) {
      const bisaDibukaSeseorang = group.items.some((item) =>
        PERMISSIONS.some((permission) => canAccessAdminPath(staff(permission), item.href)) ||
        canAccessAdminPath(owner, item.href),
      );
      expect(bisaDibukaSeseorang, `grup "${group.label}" tidak bisa dibuka siapa pun`).toBe(true);
    }
  });
});
