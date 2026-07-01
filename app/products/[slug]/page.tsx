import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProductSlugRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/boutique/${slug}`);
}
