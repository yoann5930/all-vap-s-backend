import { AvaKnowledgeAdmin } from "@/components/admin/ava/AvaKnowledgeAdmin";
import { AVA_PHASE4_STATUS } from "@/lib/ava/phase4/constants";

export default function AdminAvaKnowledgePage() {
  return (
    <div className="mx-auto max-w-5xl py-6">
      <h1 className="mb-1 px-4 text-2xl font-semibold">A.V.A. — Base métier Phase 4</h1>
      <p className="mb-4 px-4 text-sm text-muted-foreground">
        Fiches matériel, compatibilités, guides, FAQ, SAV — historisées.{" "}
        {AVA_PHASE4_STATUS.official}
      </p>
      <AvaKnowledgeAdmin />
    </div>
  );
}
