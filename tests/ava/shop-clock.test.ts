/**
 * Horloge boutique AVA — 15 août 2026 = Assomption, magasins fermés.
 */
import {
  frenchHolidayName,
  getShopClock,
  parisInstant,
  shopClockSystemLine,
  speakShopClock,
  speakShopOpenClosed,
  westernEasterSunday,
} from "../../lib/ava/shop-clock";
import { classifyAvaNeed } from "../../lib/ava/unified-brain";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else {
    console.log("OK", label);
  }
}

const easter2026 = westernEasterSunday(2026);
assert(easter2026.month === 4 && easter2026.day === 5, "Pâques 2026 = 5 avril");
assert(frenchHolidayName(2026, 4, 6) === "Lundi de Pâques", "lundi de Pâques 2026");
assert(frenchHolidayName(2026, 8, 15) === "Assomption", "15 août = Assomption");
assert(frenchHolidayName(2026, 8, 16) === null, "16 août n'est pas férié");
assert(frenchHolidayName(2026, 7, 14) === "Fête nationale", "14 juillet");

const assumption = getShopClock(parisInstant(2026, 8, 15, 17, 30));
assert(assumption.timeZone === "Europe/Paris", "fuseau Paris");
assert(assumption.weekdayFr === "samedi", "15 août 2026 = samedi");
assert(assumption.dateSpoken === "samedi 15 août 2026", "date parlée");
assert(assumption.timeSpoken === "17h30", "heure parlée");
assert(assumption.isHoliday === true, "férié");
assert(assumption.holidayName === "Assomption", "nom Assomption");
assert(assumption.isOpen === false, "fermé le 15 août même un samedi");
assert(assumption.closedReason === "holiday", "raison férié");

const spokenClock = speakShopClock(assumption);
assert(spokenClock.includes("samedi 15 août 2026"), "horloge dit la date");
assert(spokenClock.includes("férié"), "horloge dit férié");
assert(spokenClock.includes("Assomption"), "horloge dit Assomption");
assert(spokenClock.includes("fermées"), "horloge dit fermées");

const spokenOpen = speakShopOpenClosed(assumption);
assert(spokenOpen.startsWith("Non"), "ouvert ? → non");
assert(spokenOpen.includes("Assomption"), "ouvert ? → Assomption");
assert(spokenOpen.includes("fermées"), "ouvert ? → fermées");

const llmLine = shopClockSystemLine(assumption);
assert(llmLine.includes("Europe/Paris"), "LLM ancré Paris");
assert(llmLine.includes("Assomption"), "LLM sait Assomption");
assert(llmLine.includes("fermés"), "LLM sait magasins fermés");

const normalSaturday = getShopClock(parisInstant(2026, 8, 8, 11, 0));
assert(normalSaturday.weekdayFr === "samedi", "8 août 2026 = samedi");
assert(normalSaturday.isHoliday === false, "samedi normal pas férié");
assert(normalSaturday.isOpen === true, "samedi 11h ouvert");

const sunday = getShopClock(parisInstant(2026, 8, 16, 11, 0));
assert(sunday.isSunday === true, "16 août = dimanche");
assert(sunday.isOpen === false, "dimanche fermé");

const mondayOpen = getShopClock(parisInstant(2026, 8, 17, 11, 0));
assert(mondayOpen.isOpen === true, "lundi 11h ouvert");
const mondayClosed = getShopClock(parisInstant(2026, 8, 17, 20, 0));
assert(mondayClosed.isOpen === false, "lundi 20h fermé");

assert(classifyAvaNeed("Quel jour on est ?") === "CLOCK", "quel jour = CLOCK");
assert(classifyAvaNeed("Quelle date on est ?") === "CLOCK", "quelle date = CLOCK");
assert(classifyAvaNeed("Quelle heure est-il ?") === "CLOCK", "quelle heure = CLOCK");
assert(classifyAvaNeed("C'est férié aujourd'hui ?") === "CLOCK", "férié = CLOCK");
assert(classifyAvaNeed("Vous êtes ouvert ?") === "BUSINESS", "ouvert = BUSINESS");
assert(classifyAvaNeed("Vous êtes ouvert aujourd'hui ?") === "BUSINESS", "ouvert aujourd'hui = BUSINESS");

if (fail) process.exit(1);
console.log("OK shop clock");
