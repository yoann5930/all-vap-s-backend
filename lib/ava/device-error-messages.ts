/**
 * Messages d'erreur matériels courants.
 */
export type DeviceErrorEntry = {
  display: string;
  aliases: string[];
  meaning: string;
  safeChecks: string[];
  stopConditions?: string[];
  requiresShop?: boolean;
};

export const DEVICE_ERROR_MESSAGES: DeviceErrorEntry[] = [
  {
    display: "No Atomizer",
    aliases: ["no atomizer", "pas d'atomiseur", "atomizer not found"],
    meaning: "L'appareil ne détecte pas la cartouche ou la résistance.",
    safeChecks: [
      "Retirez et remettez la cartouche.",
      "Vérifiez que les contacts sont propres et secs.",
      "Essayez une autre cartouche / résistance compatible si vous en avez une.",
    ],
  },
  {
    display: "Check Atomizer",
    aliases: [
      "check atomizer",
      "checkatomizer",
      "vérifier atomiseur",
      "verifier atomiseur",
      "check atomiseur",
    ],
    meaning:
      "La box ne détecte pas correctement l'atomiseur, la cartouche, la résistance ou le contact électrique. L'appareil peut s'allumer et l'écran fonctionner — ne pas conclure à une panne électronique de la box.",
    safeChecks: [
      "Vérifier que la cartouche / l'atomiseur est bien en place.",
      "Retirer puis remettre la cartouche.",
      "Vérifier que la résistance est correctement installée si elle est remplaçable.",
      "Contrôler que les contacts sont propres et secs.",
      "Si disponible, tester une autre cartouche / résistance compatible (sans forcer un achat).",
      "Si le message persiste après ces contrôles : photos détaillées puis orientation boutique / SAV — sans affirmer que la box est morte.",
    ],
    stopConditions: [
      "Liquide dans le logement, échauffement, batterie gonflée, fumée, odeur anormale, contact brûlé → arrêt immédiat, ne pas recharger, ne pas démonter la box.",
    ],
  },
  {
    display: "Atomizer Short",
    aliases: ["atomizer short", "shorted", "short"],
    meaning: "Court-circuit détecté sur la résistance.",
    safeChecks: [
      "Ne forcez pas.",
      "Changez la résistance / cartouche compatible.",
    ],
    stopConditions: ["Si l'appareil chauffe anormalement, arrêtez immédiatement."],
    requiresShop: true,
  },
  {
    display: "Low Resistance",
    aliases: ["low resistance", "low ohm"],
    meaning: "Résistance trop basse pour l'appareil ou mal lue.",
    safeChecks: ["Vérifiez que la résistance est compatible avec votre cartouche."],
  },
  {
    display: "High Resistance",
    aliases: ["high resistance"],
    meaning: "Résistance trop élevée ou contact intermittent.",
    safeChecks: ["Remettez la cartouche, contrôlez les contacts."],
  },
  {
    display: "Low Battery",
    aliases: ["low battery", "batterie faible"],
    meaning: "Batterie faible.",
    safeChecks: ["Rechargez avec le câble adapté, appareil éteint si possible."],
  },
  {
    display: "Check Battery",
    aliases: ["check battery"],
    meaning: "Problème de batterie ou d'accu.",
    safeChecks: ["N'utilisez pas d'accu abîmé.", "Contrôlez le sens des polarités si accus amovibles."],
    requiresShop: true,
  },
  {
    display: "Overheat",
    aliases: ["overheat", "too hot", "trop chaud"],
    meaning: "Surchauffe protégée par la puce.",
    safeChecks: ["Laissez refroidir.", "Ne rechargez pas tant que l'appareil est chaud."],
    stopConditions: ["Si la chauffe est anormale ou s'accompagne d'odeur, arrêtez et allez en boutique."],
  },
  {
    display: "Time Over",
    aliases: ["time over", "cut off", "cutoff"],
    meaning: "Coupure de sécurité après une longue aspiration.",
    safeChecks: ["Relâchez, attendez une seconde, réessayez plus court."],
  },
  {
    display: "New Coil / Old Coil",
    aliases: ["new coil", "old coil"],
    meaning: "L'appareil demande de confirmer une nouvelle ou ancienne résistance.",
    safeChecks: ["Sélectionnez New Coil après un changement de résistance."],
  },
  {
    display: "Lock",
    aliases: ["lock", "power lock", "verrouillé"],
    meaning: "Appareil ou puissance verrouillés.",
    safeChecks: ["Suivez la procédure de déverrouillage du modèle (après confirmation visuelle)."],
  },
];

export function matchDeviceError(message: string): DeviceErrorEntry | null {
  const t = message.toLowerCase();
  return (
    DEVICE_ERROR_MESSAGES.find(
      (e) =>
        t.includes(e.display.toLowerCase()) ||
        e.aliases.some((a) => t.includes(a.toLowerCase()))
    ) ?? null
  );
}
