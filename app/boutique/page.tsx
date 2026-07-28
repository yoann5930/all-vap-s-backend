import { HomeShowcase } from "@/components/home/HomeShowcase";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, absoluteUrl } from "@/lib/seo/config";

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
      <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[{ name: "Accueil", path: "/" }, { name: "Boutique", path: "/boutique" }]}
        />
      </div>
      <HomeShowcase />
    </>
  );
}
