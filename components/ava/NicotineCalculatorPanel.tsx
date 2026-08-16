"use client";

import { useMemo, useState } from "react";
import { mixNicotine, roundMgMl, type NicotineType } from "@/lib/nicotine";

export function NicotineCalculatorPanel({ onClose }: { onClose: () => void }) {
  const [baseVolumeMl, setBase] = useState(50);
  const [boosterVolumeMl, setBoosterVol] = useState(10);
  const [boosterStrengthMgMl, setStrength] = useState(20);
  const [boosterCount, setCount] = useState(1);
  const [nicotineType, setType] = useState<NicotineType>("FREEBASE");

  const result = useMemo(
    () =>
      mixNicotine({
        baseVolumeMl,
        boosterVolumeMl,
        boosterStrengthMgMl,
        boosterCount,
        nicotineType,
      }),
    [baseVolumeMl, boosterVolumeMl, boosterStrengthMgMl, boosterCount, nicotineType]
  );

  return (
    <div
      role="dialog"
      aria-label="Calcul nicotine"
      className="mx-3 mb-2 w-full max-w-md rounded-xl border border-cyan-500/30 bg-black/85 p-3 text-cyan-50 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs tracking-wide text-cyan-200">Calcul nicotine</p>
        <button type="button" className="text-[11px] text-cyan-400/70" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label>
          Volume liquide (ml)
          <input
            className="mt-0.5 w-full rounded border border-cyan-800/40 bg-black/40 px-2 py-1"
            type="number"
            min={0}
            value={baseVolumeMl}
            onChange={(e) => setBase(Number(e.target.value))}
          />
        </label>
        <label>
          Volume booster (ml)
          <input
            className="mt-0.5 w-full rounded border border-cyan-800/40 bg-black/40 px-2 py-1"
            type="number"
            min={0}
            value={boosterVolumeMl}
            onChange={(e) => setBoosterVol(Number(e.target.value))}
          />
        </label>
        <label>
          Concentration booster
          <input
            className="mt-0.5 w-full rounded border border-cyan-800/40 bg-black/40 px-2 py-1"
            type="number"
            min={0}
            value={boosterStrengthMgMl}
            onChange={(e) => setStrength(Number(e.target.value))}
          />
        </label>
        <label>
          Nombre de boosters
          <input
            className="mt-0.5 w-full rounded border border-cyan-800/40 bg-black/40 px-2 py-1"
            type="number"
            min={0}
            max={nicotineType === "FREEBASE" ? 5 : 20}
            value={boosterCount}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="mt-2 block text-[11px]">
        Type
        <select
          className="mt-0.5 w-full rounded border border-cyan-800/40 bg-black/40 px-2 py-1"
          value={nicotineType}
          onChange={(e) => setType(e.target.value as NicotineType)}
        >
          <option value="FREEBASE">Nicotine classique</option>
          <option value="SALT">Sels de nicotine</option>
        </select>
      </label>
      <dl className="mt-2 space-y-0.5 text-[11px] text-cyan-100/90">
        <div>Volume final : {roundMgMl(result.finalVolumeMl, 1)} ml</div>
        <div>Nicotine totale : {roundMgMl(result.totalNicotineMg, 1)} mg</div>
        <div>Taux réel : {roundMgMl(result.actualMgMl)} mg/ml</div>
        {result.commercialTargetMgMl != null ? (
          <div>Taux cible All Vap&apos;s : {result.commercialTargetMgMl} mg/ml</div>
        ) : null}
      </dl>
      {result.alert ? (
        <p className="mt-2 text-[11px] text-amber-300" role="alert">
          {result.alert}
        </p>
      ) : null}
    </div>
  );
}
