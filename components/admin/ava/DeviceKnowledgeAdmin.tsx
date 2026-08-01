"use client";

import { useMemo, useState } from "react";
import { listPronunciations, type PronunciationEntry } from "@/lib/ava/pronunciation-engine";
import { listDevices, devicesWithoutOfficialManual } from "@/lib/ava/device-support";

export function DeviceKnowledgeAdmin() {
  const [q, setQ] = useState("");
  const pronunciations = useMemo(() => listPronunciations(), []);
  const devices = useMemo(() => listDevices(), []);
  const missingManuals = useMemo(() => devicesWithoutOfficialManual(), []);
  const stats = useMemo(() => {
    const withoutPhoto = devices.filter(
      (d) => !d.images || Object.keys(d.images || {}).length === 0
    ).length;
    const withoutCoils = devices.filter(
      (d) => !d.compatibleCoils || d.compatibleCoils.length === 0
    ).length;
    return {
      total: devices.length,
      verified: devices.filter((d) => d.verificationStatus === "OFFICIAL_CONFIRMED")
        .length,
      needsOfficial: devices.filter(
        (d) => d.verificationStatus === "NEEDS_OFFICIAL_DATA"
      ).length,
      withoutManual: missingManuals.length,
      withoutPhoto,
      withoutCoils,
    };
  }, [devices, missingManuals]);

  const filtered = pronunciations.filter(
    (p) =>
      !q ||
      p.brand.toLowerCase().includes(q.toLowerCase()) ||
      p.spoken.toLowerCase().includes(q.toLowerCase())
  );

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="space-y-8 p-4">
      <section>
        <h2 className="text-lg font-semibold">Prononciations</h2>
        <p className="text-sm text-muted-foreground">
          Voix française naturelle — pas d&apos;accent anglais. e.Tasty → « i tésti ».
        </p>
        <input
          className="mt-2 w-full max-w-md rounded border px-3 py-2 text-sm"
          placeholder="Rechercher une marque…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Rechercher une marque"
        />
        <ul className="mt-3 divide-y rounded border">
          {filtered.map((p) => (
            <PronunciationRow key={p.brand} entry={p} onSpeak={speak} />
          ))}
        </ul>
        <p className="mt-2 text-xs text-amber-700">
          Édition persistante : modifier `data/ava/pronunciations.json` puis redéployer
          (UI d&apos;écriture serveur à brancher en phase 2).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Base matériel</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <li>Modèles trouvés : {stats.total}</li>
          <li>Modèles vérifiés (OFFICIAL_CONFIRMED) : {stats.verified}</li>
          <li>Sans notice officielle : {stats.withoutManual}</li>
          <li>Sans photo : {stats.withoutPhoto}</li>
          <li>Sans compatibilités coils : {stats.withoutCoils}</li>
          <li>NEEDS_OFFICIAL_DATA : {stats.needsOfficial}</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          Import SumUp : `npm run ava:devices:import` · Audit : `npm run ava:devices:audit`
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1">Fabricant</th>
              <th>Modèle</th>
              <th>Statut</th>
              <th>Notice</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={`${d.manufacturerSlug}-${d.modelSlug}`} className="border-b">
                <td className="py-1">{d.manufacturer}</td>
                <td>{d.model}</td>
                <td>{d.verificationStatus}</td>
                <td>{d.officialManualUrl ? "oui" : "à confirmer"}</td>
                <td>
                  {d.images && Object.keys(d.images).length > 0 ? "oui" : "non"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PronunciationRow({
  entry,
  onSpeak,
}: {
  entry: { brand: string } & PronunciationEntry;
  onSpeak: (t: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div>
        <p className="font-medium">{entry.brand}</p>
        <p className="text-xs text-muted-foreground">
          {entry.spoken} · {entry.languageStyle}
        </p>
      </div>
      <button
        type="button"
        className="rounded border px-3 py-1 text-xs"
        onClick={() => onSpeak(entry.spoken)}
      >
        Écouter
      </button>
    </li>
  );
}
