import { auth } from "@/lib/auth";

export default async function AdminDashboardPage() {
  const session = await auth();
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard Admin</h1>
      <p>Login sebagai: {session?.user?.email} (role: {session?.user?.role})</p>
    </div>
  );
}
