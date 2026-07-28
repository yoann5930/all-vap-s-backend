import { HomeShowcase } from "@/components/home/HomeShowcase";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, absoluteUrl } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/"),
  },
};

export default function HomePage() {
  return <HomeShowcase />;
}
