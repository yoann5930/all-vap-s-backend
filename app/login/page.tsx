import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = {
  title: "Connexion - All Vap's",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="text-center text-[#A7B0BC]">Chargement…</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
