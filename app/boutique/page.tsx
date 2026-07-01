import { Suspense } from "react";
import { ProductCatalog } from "@/components/shop/ProductCatalog";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from "@/lib/seo/config";
import { absoluteUrl } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Boutique",
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/boutique") },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/boutique"),
  },
};

export default function BoutiquePage() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ name: "Accueil", path: "/" }, { name: "Boutique", path: "/boutique" }]} />
      </div>
      <Suspense fallback={<div className="py-20 text-center text-gray-500">Chargement du catalogue...</div>}>
        <ProductCatalog />
      </Suspense>
    </>
  );
}
