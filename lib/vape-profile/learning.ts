import type { DrawPreference, FlavorTag, VapeProfileData, VapeStatus } from "@/lib/vape-profile/types";

export function extractProfileUpdates(message: string): Partial<VapeProfileData> {
  const text = message.toLowerCase();
  const updates: Partial<VapeProfileData> = {};

  if (/d[ée]butant|d[ée]bute|commence|nouveau/i.test(text)) {
    updates.status = "debutant";
  }
  if (/confirm[ée]|exp[ée]riment[ée]|habitu[ée]|avanc[ée]/i.test(text)) {
    updates.status = "confirme";
  }

  if (/serr[ée]|mtl|indirect|serre/i.test(text)) updates.drawPreference = "serre";
  if (/a[ée]rien|dl|direct|gros.?nuage/i.test(text)) updates.drawPreference = "aerien";
  if (/mixte/i.test(text)) updates.drawPreference = "mixte";

  const preferred: FlavorTag[] = [];
  const avoided: FlavorTag[] = [];

  if (/fruit[ée]?|fruits?|framboise|mangue|ananas/i.test(text)) preferred.push("fruite");
  if (/frais|menthe|mint|heisenberg|glacial/i.test(text)) preferred.push("frais");
  if (/gourmand|dessert|vanille|caramel|tarte/i.test(text)) preferred.push("gourmand");
  if (/classic|tabac|ry4|blond/i.test(text)) preferred.push("classic");
  if (/boisson|cola|caf[ée]|energy/i.test(text)) preferred.push("boisson");

  if (/pas.*fruit|sans.*fruit|d[ée]teste.*fruit/i.test(text)) avoided.push("fruite");
  if (/pas.*menthe|sans.*menthe|d[ée]teste.*menthe/i.test(text)) avoided.push("frais");
  if (/pas.*tabac|sans.*tabac/i.test(text)) avoided.push("classic");

  if (preferred.length) updates.preferredFlavors = preferred;
  if (avoided.length) updates.avoidedFlavors = avoided;

  const cigMatch = text.match(/(\d+)\s*(cigarettes?|clopes?)/i);
  if (cigMatch) updates.cigarettesPerDay = parseInt(cigMatch[1], 10);

  const nicMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mg/i);
  if (nicMatch) {
    const mg = Math.round(parseFloat(nicMatch[1].replace(",", ".")));
    updates.usedNicotineMg = mg;
    updates.advisedNicotineMg = mg;
  }

  const budgetMatch = text.match(/(\d+)\s*€/);
  if (budgetMatch) updates.averageBudgetCents = parseInt(budgetMatch[1], 10) * 100;

  return updates;
}

export function mergeProfileUpdates(
  current: VapeProfileData,
  updates: Partial<VapeProfileData>
): VapeProfileData {
  return {
    ...current,
    ...updates,
    status: (updates.status as VapeStatus) ?? current.status,
    drawPreference: (updates.drawPreference as DrawPreference) ?? current.drawPreference,
    preferredFlavors: updates.preferredFlavors
      ? [...new Set([...current.preferredFlavors, ...updates.preferredFlavors])]
      : current.preferredFlavors,
    avoidedFlavors: updates.avoidedFlavors
      ? [...new Set([...current.avoidedFlavors, ...updates.avoidedFlavors])]
      : current.avoidedFlavors,
  };
}
