import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-6xl font-bold text-brand-700">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-gray-900">Page introuvable</h2>
      <p className="mt-2 text-gray-600">
        La page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button href="/" className="mt-8">
        Retour à l&apos;accueil
      </Button>
    </div>
  );
}
