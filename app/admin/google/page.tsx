import { AdminGoogleSyncClient } from "@/components/admin/AdminGoogleSyncClient";

export default function AdminGooglePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Google Drive / Sheets</h1>
      <p className="mt-1 text-gray-600">
        Architecture prête — synchronisation désactivée tant que les variables d&apos;environnement
        sont vides.
      </p>
      <AdminGoogleSyncClient />
    </div>
  );
}
