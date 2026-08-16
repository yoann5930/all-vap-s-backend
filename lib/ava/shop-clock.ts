/**
 * Horloge boutique AVA — Europe/Paris uniquement.
 * Ne pas modifier lib/timezone/shop-tz.ts (inventaire).
 */
import { DEFAULT_SHOP_TIMEZONE, getShopNowParts, zonedLocalToUtc } from "@/lib/timezone/shop-tz";

const WEEKDAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const OPEN_HOUR = 10;
const CLOSE_HOUR = 19;

export type ShopClock = {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  weekdayFr: string;
  dateSpoken: string;
  timeSpoken: string;
  holidayName: string | null;
  isHoliday: boolean;
  isSunday: boolean;
  isOpen: boolean;
  closedReason: "holiday" | "sunday" | "after_hours" | "before_hours" | null;
};

export function westernEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function ymdKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Jours fériés légaux France métropolitaine (Hautmont / Le Quesnoy). */
export function frenchHolidayName(year: number, month: number, day: number): string | null {
  const easter = westernEasterSunday(year);
  const easterMonday = addCalendarDays(year, easter.month, easter.day, 1);
  const ascension = addCalendarDays(year, easter.month, easter.day, 39);
  const whitMonday = addCalendarDays(year, easter.month, easter.day, 50);
  const map: Record<string, string> = {
    [ymdKey(year, 1, 1)]: "Jour de l'An",
    [ymdKey(easterMonday.year, easterMonday.month, easterMonday.day)]: "Lundi de Pâques",
    [ymdKey(year, 5, 1)]: "Fête du Travail",
    [ymdKey(year, 5, 8)]: "Victoire 1945",
    [ymdKey(ascension.year, ascension.month, ascension.day)]: "Ascension",
    [ymdKey(whitMonday.year, whitMonday.month, whitMonday.day)]: "Lundi de Pentecôte",
    [ymdKey(year, 7, 14)]: "Fête nationale",
    [ymdKey(year, 8, 15)]: "Assomption",
    [ymdKey(year, 11, 1)]: "Toussaint",
    [ymdKey(year, 11, 11)]: "Armistice",
    [ymdKey(year, 12, 25)]: "Noël",
  };
  return map[ymdKey(year, month, day)] ?? null;
}

function weekdayInParis(now: Date): number {
  const wd =
    new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_SHOP_TIMEZONE,
      weekday: "short",
    })
      .formatToParts(now)
      .find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function speakTime(hour: number, minute: number): string {
  if (minute === 0) return `${hour}h`;
  return `${hour}h${String(minute).padStart(2, "0")}`;
}

export function getShopClock(now = new Date()): ShopClock {
  const parts = getShopNowParts(DEFAULT_SHOP_TIMEZONE, now);
  const weekday = weekdayInParis(now);
  const holidayName = frenchHolidayName(parts.year, parts.month, parts.day);
  const isHoliday = Boolean(holidayName);
  const isSunday = weekday === 0;
  const beforeHours = parts.hour < OPEN_HOUR;
  const afterHours = parts.hour >= CLOSE_HOUR;
  let closedReason: ShopClock["closedReason"] = null;
  let isOpen = false;
  if (isHoliday) closedReason = "holiday";
  else if (isSunday) closedReason = "sunday";
  else if (beforeHours) closedReason = "before_hours";
  else if (afterHours) closedReason = "after_hours";
  else isOpen = true;

  return {
    timeZone: DEFAULT_SHOP_TIMEZONE,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekday,
    weekdayFr: WEEKDAYS_FR[weekday],
    dateSpoken: `${WEEKDAYS_FR[weekday]} ${parts.day} ${MONTHS_FR[parts.month - 1]} ${parts.year}`,
    timeSpoken: speakTime(parts.hour, parts.minute),
    holidayName,
    isHoliday,
    isSunday,
    isOpen,
    closedReason,
  };
}

export function speakShopClock(clock: ShopClock = getShopClock()): string {
  const holiday = clock.isHoliday
    ? ` C'est férié : ${clock.holidayName}. Les deux boutiques sont fermées.`
    : "";
  const closed =
    !clock.isHoliday && !clock.isOpen
      ? clock.isSunday
        ? " Dimanche, les deux boutiques sont fermées."
        : " Les boutiques sont fermées pour le moment."
      : "";
  const open = clock.isOpen ? " Les boutiques sont ouvertes jusqu'à 19h." : "";
  return `Aujourd'hui on est ${clock.dateSpoken}. Il est ${clock.timeSpoken}.${holiday}${closed}${open}`;
}

export function speakShopOpenClosed(clock: ShopClock = getShopClock()): string {
  if (clock.isHoliday) {
    return (
      `Non, aujourd'hui c'est férié (${clock.holidayName}), les deux boutiques sont fermées. ` +
      `D'habitude on est ouverts lundi à samedi de 10h à 19h, dimanche fermé.`
    );
  }
  if (clock.isSunday) {
    return "Non, aujourd'hui c'est dimanche, les deux boutiques sont fermées. On ouvre lundi de 10h à 19h.";
  }
  if (clock.isOpen) {
    return "Oui, on est ouverts jusqu'à 19h. Lundi à samedi de 10h à 19h, dimanche fermé.";
  }
  if (clock.closedReason === "before_hours") {
    return "Pas encore : on ouvre à 10h. Lundi à samedi de 10h à 19h, dimanche fermé.";
  }
  return "Non, c'est fermé pour ce soir. On ouvre demain à 10h, sauf dimanche et jour férié.";
}

/** Contexte imposé au LLM — ne pas inventer une autre date. */
export function shopClockSystemLine(clock: ShopClock = getShopClock()): string {
  const status = clock.isHoliday
    ? `Jour férié : ${clock.holidayName}. Magasins All Vap's fermés (Hautmont et Le Quesnoy).`
    : clock.isOpen
      ? "Pas de jour férié. Magasins ouverts jusqu'à 19h."
      : clock.isSunday
        ? "Pas de jour férié. Dimanche : magasins fermés."
        : "Pas de jour férié. Magasins fermés (hors horaires).";
  return (
    `HORLOGE BOUTIQUE (Europe/Paris, source serveur — n'invente pas une autre date ni un autre jour) :\n` +
    `Maintenant : ${clock.dateSpoken}, ${clock.timeSpoken}.\n` +
    `${status}\n` +
    `Horaires habituels : lundi à samedi 10h–19h, dimanche fermé. Un jour férié, les magasins restent fermés.`
  );
}

export function parisInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return zonedLocalToUtc(year, month, day, hour, minute, 0, DEFAULT_SHOP_TIMEZONE);
}
