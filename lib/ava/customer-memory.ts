/**
 * Mémoire client AVA — structurée, versionnée, liée au compte authentifié.
 * Persistance via VapeProfile existant (pas de table parallèle, pas d’OpenAI).
 * Ne jamais formuler « dossier / fiche / base client » côté client.
 */
import type { VapeProfileData } from "@/lib/vape-profile/types";
import type { AvaExperienceLevel } from "@/lib/ava/advisor-policy";
import { levelFromVapeStatus, vapeStatusFromLevel } from "@/lib/ava/advisor-policy";

export const AVA_MEMORY_VERSION = 1 as const;

export type AvaCustomerMemory = {
  version: typeof AVA_MEMORY_VERSION;
  experienceLevel: AvaExperienceLevel;
  firstName: string | null;
  cigarettesPerDay: number | null;
  cigarettesPerDayPrevious: number | null;
  allDayNeed: boolean | null;
  usedNicotineMg: number | null;
  advisedNicotineMg: number | null;
  nicotineHistoryMg: number[];
  recommendedProductIds: string[];
  selectedDeviceName: string | null;
  currentDeviceName: string | null;
  preferredFlavors: string[];
  avoidedFlavors: string[];
  updatedAt: string;
};

export function emptyCustomerMemory(
  partial?: Partial<AvaCustomerMemory>,
): AvaCustomerMemory {
  return {
    version: AVA_MEMORY_VERSION,
    experienceLevel: "BEGINNER",
    firstName: null,
    cigarettesPerDay: null,
    cigarettesPerDayPrevious: null,
    allDayNeed: null,
    usedNicotineMg: null,
    advisedNicotineMg: null,
    nicotineHistoryMg: [],
    recommendedProductIds: [],
    selectedDeviceName: null,
    currentDeviceName: null,
    preferredFlavors: [],
    avoidedFlavors: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function memoryFromVapeProfile(
  profile: VapeProfileData | null | undefined,
  firstName?: string | null,
): AvaCustomerMemory {
  if (!profile) return emptyCustomerMemory({ firstName: firstName ?? null });
  const nic = profile.usedNicotineMg ?? profile.advisedNicotineMg;
  return emptyCustomerMemory({
    experienceLevel: levelFromVapeStatus(profile.status),
    firstName: firstName ?? null,
    cigarettesPerDay: profile.cigarettesPerDay,
    usedNicotineMg: profile.usedNicotineMg,
    advisedNicotineMg: profile.advisedNicotineMg,
    nicotineHistoryMg: nic != null ? [nic] : [],
    recommendedProductIds: profile.advisedProductIds ?? [],
    preferredFlavors: profile.preferredFlavors ?? [],
    avoidedFlavors: profile.avoidedFlavors ?? [],
  });
}

export function applyCigarettesCorrection(
  memory: AvaCustomerMemory,
  nextCigs: number,
): AvaCustomerMemory {
  if (memory.cigarettesPerDay === nextCigs) {
    return { ...memory, updatedAt: new Date().toISOString() };
  }
  return {
    ...memory,
    cigarettesPerDayPrevious: memory.cigarettesPerDay,
    cigarettesPerDay: nextCigs,
    updatedAt: new Date().toISOString(),
  };
}

export function applyNicotineMemory(
  memory: AvaCustomerMemory,
  mg: number,
  role: "used" | "advised" = "used",
): AvaCustomerMemory {
  const history = [...memory.nicotineHistoryMg];
  if (history[history.length - 1] !== mg) history.push(mg);
  return {
    ...memory,
    usedNicotineMg: role === "used" ? mg : memory.usedNicotineMg,
    advisedNicotineMg: role === "advised" ? mg : memory.advisedNicotineMg ?? mg,
    nicotineHistoryMg: history.slice(-12),
    updatedAt: new Date().toISOString(),
  };
}

export function toVapeProfilePatch(memory: AvaCustomerMemory): Partial<VapeProfileData> {
  return {
    status: vapeStatusFromLevel(memory.experienceLevel),
    cigarettesPerDay: memory.cigarettesPerDay,
    usedNicotineMg: memory.usedNicotineMg,
    advisedNicotineMg: memory.advisedNicotineMg,
    advisedProductIds: memory.recommendedProductIds.slice(0, 12),
    lastRecommendationAt: memory.updatedAt,
  };
}

export function publicMemoryForPrompt(memory: AvaCustomerMemory): {
  experienceLevel: AvaExperienceLevel;
  cigarettesPerDay: number | null;
  usedNicotineMg: number | null;
  currentDeviceName: string | null;
} {
  return {
    experienceLevel: memory.experienceLevel,
    cigarettesPerDay: memory.cigarettesPerDay,
    usedNicotineMg: memory.usedNicotineMg,
    currentDeviceName: memory.currentDeviceName,
  };
}
