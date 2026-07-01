import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = {
  title: "Inscription - All Vap's",
};

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <AuthForm mode="register" />
    </div>
  );
}
