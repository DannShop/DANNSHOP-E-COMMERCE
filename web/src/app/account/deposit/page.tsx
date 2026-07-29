import { DepositForm } from "./deposit-form";

export default function DepositPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-heading text-2xl font-bold">Isi Saldo</h1>
      <DepositForm />
    </div>
  );
}
