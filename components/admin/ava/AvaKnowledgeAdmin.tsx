"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { AVA_PHASE4_STATUS } from "@/lib/ava/phase4/constants";

type Tab = "equipment" | "compatibility" | "guide" | "faq" | "sav" | "audit";

/**
 * Admin Phase 4 — création brouillons historisés.
 * Aucune donnée fictive préchargée. Tables absentes → message clair.
 */
export function AvaKnowledgeAdmin() {
  const [tab, setTab] = useState<Tab>("equipment");
  const [data, setData] = useState<{
    equipment: Array<{ id: string; manufacturer: string; model: string; status: string }>;
    guides: Array<{ id: string; title: string; status: string }>;
    faq: Array<{ id: string; question: string; status: string }>;
    sav: Array<{ id: string; title: string; status: string }>;
    compatibilities: Array<{ id: string; relationType: string; status: string }>;
    audit: Array<{ id: string; entityType: string; action: string; createdAt: string }>;
    note?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/ava-knowledge");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chargement impossible");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(entity: Tab, payload: Record<string, unknown>) {
    if (entity === "audit") return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/ava-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec");
      setMsg(`Créé en DRAFT — id ${json.created?.id || "?"}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4">
      <p className="text-xs text-amber-700">{AVA_PHASE4_STATUS.official}</p>
      <p className="text-sm text-muted-foreground">
        Création de fiches en statut DRAFT uniquement. Publication VERIFIED = validation humaine.
        Puff / JNR refusés. Aucune modification prix / stock / produit.
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["equipment", "Fiche matériel"],
            ["compatibility", "Compatibilité"],
            ["guide", "Guide"],
            ["faq", "FAQ"],
            ["sav", "Procédure SAV"],
            ["audit", "Historique"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "primary" : "outline"}
            onClick={() => setTab(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {data?.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}

      {tab === "equipment" ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void submit("equipment", {
                  kind: String(fd.get("kind")),
                  manufacturer: String(fd.get("manufacturer")),
                  model: String(fd.get("model")),
                  slug: String(fd.get("slug")),
                  summary: String(fd.get("summary") || "") || undefined,
                  sourceNote: String(fd.get("sourceNote") || "") || undefined,
                });
              }}
            >
              <select name="kind" className="rounded border px-2 py-1 text-sm" defaultValue="DEVICE">
                <option value="DEVICE">Cigarette électronique</option>
                <option value="CARTRIDGE">Cartouche</option>
                <option value="COIL">Résistance</option>
                <option value="BATTERY">Batterie</option>
                <option value="CHARGER">Chargeur</option>
                <option value="ACCESSORY">Accessoire</option>
                <option value="ELIQUID">E-liquide</option>
              </select>
              <input name="slug" required placeholder="slug-unique" className="rounded border px-2 py-1 text-sm" />
              <input name="manufacturer" required placeholder="Fabricant" className="rounded border px-2 py-1 text-sm" />
              <input name="model" required placeholder="Modèle" className="rounded border px-2 py-1 text-sm" />
              <input name="summary" placeholder="Résumé (optionnel)" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="sourceNote" placeholder="Source officielle (optionnel)" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2">
                Ajouter fiche (DRAFT)
              </Button>
            </form>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs">
              {(data?.equipment || []).map((e) => (
                <li key={e.id}>
                  {e.manufacturer} {e.model} — {e.status}
                </li>
              ))}
              {!data?.equipment?.length ? (
                <li className="text-muted-foreground">Aucune fiche (ou migration non appliquée).</li>
              ) : null}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {tab === "compatibility" ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void submit("compatibility", {
                  fromEquipmentId: String(fd.get("fromEquipmentId")),
                  toEquipmentId: String(fd.get("toEquipmentId")),
                  relationType: String(fd.get("relationType")),
                  notes: String(fd.get("notes") || "") || undefined,
                  sourceNote: String(fd.get("sourceNote") || "") || undefined,
                });
              }}
            >
              <input name="fromEquipmentId" required placeholder="ID fiche source" className="rounded border px-2 py-1 text-sm" />
              <input name="toEquipmentId" required placeholder="ID fiche cible" className="rounded border px-2 py-1 text-sm" />
              <input name="relationType" required placeholder="ex. coil_for_device" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="notes" placeholder="Notes" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="sourceNote" placeholder="Source (notice officielle…)" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2">
                Ajouter compatibilité (DRAFT)
              </Button>
            </form>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs">
              {(data?.compatibilities || []).map((c) => (
                <li key={c.id}>
                  {c.relationType} — {c.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {tab === "guide" ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void submit("guide", {
                  kind: String(fd.get("kind")),
                  title: String(fd.get("title")),
                  slug: String(fd.get("slug")),
                  summary: String(fd.get("summary") || "") || undefined,
                  bodyMarkdown: String(fd.get("bodyMarkdown") || "") || undefined,
                  mediaUrl: String(fd.get("mediaUrl") || "") || undefined,
                  sourceNote: String(fd.get("sourceNote") || "") || undefined,
                });
              }}
            >
              <select name="kind" className="rounded border px-2 py-1 text-sm" defaultValue="STARTUP">
                <option value="STARTUP">Démarrage</option>
                <option value="MAINTENANCE">Entretien</option>
                <option value="TROUBLESHOOTING">Dépannage</option>
                <option value="FAQ">FAQ</option>
                <option value="VIDEO">Vidéo</option>
                <option value="DOCUMENT">Document</option>
              </select>
              <input name="slug" required placeholder="slug" className="rounded border px-2 py-1 text-sm" />
              <input name="title" required placeholder="Titre" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="summary" placeholder="Résumé" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <textarea name="bodyMarkdown" placeholder="Contenu markdown (optionnel)" className="rounded border px-2 py-1 text-sm sm:col-span-2" rows={3} />
              <input name="mediaUrl" placeholder="URL média / PDF" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="sourceNote" placeholder="Source" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2">
                Ajouter guide (DRAFT)
              </Button>
            </form>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs">
              {(data?.guides || []).map((g) => (
                <li key={g.id}>
                  {g.title} — {g.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {tab === "faq" ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void submit("faq", {
                  question: String(fd.get("question")),
                  answer: String(fd.get("answer")),
                  sourceNote: String(fd.get("sourceNote") || "") || undefined,
                });
              }}
            >
              <input name="question" required placeholder="Question" className="rounded border px-2 py-1 text-sm" />
              <textarea name="answer" required placeholder="Réponse" className="rounded border px-2 py-1 text-sm" rows={3} />
              <input name="sourceNote" placeholder="Source" className="rounded border px-2 py-1 text-sm" />
              <Button type="submit" size="sm" disabled={busy}>
                Ajouter FAQ (DRAFT)
              </Button>
            </form>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs">
              {(data?.faq || []).map((f) => (
                <li key={f.id}>
                  {f.question} — {f.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {tab === "sav" ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void submit("sav", {
                  title: String(fd.get("title")),
                  slug: String(fd.get("slug")),
                  equipmentId: String(fd.get("equipmentId") || "") || undefined,
                  sourceNote: String(fd.get("sourceNote") || "") || undefined,
                });
              }}
            >
              <input name="title" required placeholder="Titre procédure" className="rounded border px-2 py-1 text-sm" />
              <input name="slug" required placeholder="slug" className="rounded border px-2 py-1 text-sm" />
              <input name="equipmentId" placeholder="ID fiche matériel (opt.)" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <input name="sourceNote" placeholder="Source" className="rounded border px-2 py-1 text-sm sm:col-span-2" />
              <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2">
                Ajouter procédure SAV (DRAFT)
              </Button>
            </form>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs">
              {(data?.sav || []).map((s) => (
                <li key={s.id}>
                  {s.title} — {s.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {tab === "audit" ? (
        <Card>
          <CardBody>
            <ul className="max-h-80 space-y-1 overflow-auto text-xs">
              {(data?.audit || []).map((a) => (
                <li key={a.id}>
                  {new Date(a.createdAt).toLocaleString("fr-FR")} — {a.entityType}/{a.action}
                </li>
              ))}
              {!data?.audit?.length ? (
                <li className="text-muted-foreground">Aucun historique pour l&apos;instant.</li>
              ) : null}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
