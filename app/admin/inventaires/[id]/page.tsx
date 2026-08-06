import { AdminInventaireDetailClient } from "@/components/admin/AdminInventaireDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function AdminInventaireDetailPage({ params }: Props) {
  const { id } = await params;
  return <AdminInventaireDetailClient id={id} />;
}
