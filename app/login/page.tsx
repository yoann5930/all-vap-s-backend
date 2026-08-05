import { AuthForm } from "@/components/auth/AuthForm";
import { InventoryServiceWorker } from "@/components/inventory/InventoryServiceWorker";

export const metadata = {
  title: "Connexion - All Vap's",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <InventoryServiceWorker />
      <AuthForm mode="login" />
    </div>
  );
}
