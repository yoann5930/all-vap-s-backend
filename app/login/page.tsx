import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { InventoryServiceWorker } from "@/components/inventory/InventoryServiceWorker";
import { LoginReasonBanner } from "@/components/auth/LoginReasonBanner";

export const metadata = {
  title: "Connexion - All Vap's",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <InventoryServiceWorker />
      <Suspense fallback={null}>
        <LoginReasonBanner />
      </Suspense>
      <AuthForm mode="login" />
    </div>
  );
}
