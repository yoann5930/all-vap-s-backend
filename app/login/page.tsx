import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { InventoryServiceWorker } from "@/components/inventory/InventoryServiceWorker";
import { LoginReasonBanner } from "@/components/auth/LoginReasonBanner";
import { Logo } from "@/components/layout/Logo";

export const metadata = {
  title: "Connexion - All Vap's",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <InventoryServiceWorker />
      <div className="mb-8 flex justify-center">
        <Logo size={56} />
      </div>
      <Suspense fallback={null}>
        <LoginReasonBanner />
      </Suspense>
      <AuthForm mode="login" />
    </div>
  );
}
