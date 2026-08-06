import { DeviceKnowledgeAdmin } from "@/components/admin/ava/DeviceKnowledgeAdmin";

export default function AdminAvaMaterielPage() {
  return (
    <div className="mx-auto max-w-5xl py-6">
      <h1 className="mb-2 px-4 text-2xl font-semibold">AVA — Base matériel</h1>
      <p className="mb-4 px-4 text-sm text-muted-foreground">
        Notices, prononciations, résistances et statuts de vérification.
      </p>
      <DeviceKnowledgeAdmin />
    </div>
  );
}
