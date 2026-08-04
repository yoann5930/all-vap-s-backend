import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export const metadata = {
  title: "Changer le mot de passe - All Vap's",
};

export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <Suspense fallback={<p className="text-center text-sm text-gray-500">Chargement…</p>}>
        <ChangePasswordForm />
      </Suspense>
    </div>
  );
}
