import type { PackVisemeKeyframe } from "@/lib/ava/pack-lipsync";

export type AvaPackRuntime = {
  start: number;
  timeline: PackVisemeKeyframe[];
  speaking: boolean;
};
