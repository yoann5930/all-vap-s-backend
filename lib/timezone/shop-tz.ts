/**
 * Fuseau boutique All Vap's — statistiques et rapports.
 * Jamais d'UTC implicite pour les bornes de journée affichées.
 */

export const DEFAULT_SHOP_TIMEZONE = "Europe/Paris";

export type DatePeriod =
  | "today"
  | "yesterday"
  | "day_before_yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "custom";

export type PeriodBounds = {
  start: Date;
  end: Date;
  label: string;
  timezone: string;
  key: DatePeriod | "custom";
};

function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Instant UTC correspondant à Y-M-D H:M:S dans le fuseau boutique. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_SHOP_TIMEZONE
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const p = partsInTz(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

export function getShopNowParts(timeZone = DEFAULT_SHOP_TIMEZONE, now = new Date()) {
  return partsInTz(now, timeZone);
}

export function startOfShopDay(timeZone = DEFAULT_SHOP_TIMEZONE, now = new Date()): Date {
  const p = partsInTz(now, timeZone);
  return zonedLocalToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

export function endOfShopDay(timeZone = DEFAULT_SHOP_TIMEZONE, now = new Date()): Date {
  const p = partsInTz(now, timeZone);
  return zonedLocalToUtc(p.year, p.month, p.day, 23, 59, 59, timeZone);
}

function addDays(y: number, m: number, d: number, delta: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** Lundi = début de semaine boutique. */
function startOfShopWeek(timeZone: string, now: Date): Date {
  const p = partsInTz(now, timeZone);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const d = addDays(p.year, p.month, p.day, mondayOffset);
  return zonedLocalToUtc(d.year, d.month, d.day, 0, 0, 0, timeZone);
}

function formatDayLabel(y: number, m: number, d: number) {
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function resolvePeriod(
  key: DatePeriod,
  timeZone = DEFAULT_SHOP_TIMEZONE,
  now = new Date(),
  custom?: { start: Date; end: Date }
): PeriodBounds {
  const p = partsInTz(now, timeZone);

  if (key === "custom" && custom) {
    return {
      start: custom.start,
      end: custom.end,
      label: `Période personnalisée`,
      timezone: timeZone,
      key: "custom",
    };
  }

  if (key === "last_24h") {
    return {
      start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      end: now,
      label: "Dernières 24 heures",
      timezone: timeZone,
      key,
    };
  }
  if (key === "last_7d") {
    return {
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now,
      label: "7 derniers jours",
      timezone: timeZone,
      key,
    };
  }
  if (key === "last_30d") {
    return {
      start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
      label: "30 derniers jours",
      timezone: timeZone,
      key,
    };
  }

  if (key === "today") {
    return {
      start: startOfShopDay(timeZone, now),
      end: endOfShopDay(timeZone, now),
      label: `Aujourd'hui (${formatDayLabel(p.year, p.month, p.day)})`,
      timezone: timeZone,
      key,
    };
  }

  if (key === "yesterday") {
    const y = addDays(p.year, p.month, p.day, -1);
    const ref = zonedLocalToUtc(y.year, y.month, y.day, 12, 0, 0, timeZone);
    return {
      start: startOfShopDay(timeZone, ref),
      end: endOfShopDay(timeZone, ref),
      label: `Hier (${formatDayLabel(y.year, y.month, y.day)})`,
      timezone: timeZone,
      key,
    };
  }

  if (key === "day_before_yesterday") {
    const y = addDays(p.year, p.month, p.day, -2);
    const ref = zonedLocalToUtc(y.year, y.month, y.day, 12, 0, 0, timeZone);
    return {
      start: startOfShopDay(timeZone, ref),
      end: endOfShopDay(timeZone, ref),
      label: `Avant-hier (${formatDayLabel(y.year, y.month, y.day)})`,
      timezone: timeZone,
      key,
    };
  }

  if (key === "this_week") {
    const start = startOfShopWeek(timeZone, now);
    return {
      start,
      end: endOfShopDay(timeZone, now),
      label: "Cette semaine",
      timezone: timeZone,
      key,
    };
  }

  if (key === "last_week") {
    const thisStart = startOfShopWeek(timeZone, now);
    const lastStart = new Date(thisStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastEnd = new Date(thisStart.getTime() - 1000);
    return {
      start: lastStart,
      end: lastEnd,
      label: "La semaine dernière",
      timezone: timeZone,
      key,
    };
  }

  if (key === "this_month") {
    const start = zonedLocalToUtc(p.year, p.month, 1, 0, 0, 0, timeZone);
    return {
      start,
      end: endOfShopDay(timeZone, now),
      label: `Ce mois-ci (${String(p.month).padStart(2, "0")}/${p.year})`,
      timezone: timeZone,
      key,
    };
  }

  if (key === "last_month") {
    const prev = p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
    const start = zonedLocalToUtc(prev.year, prev.month, 1, 0, 0, 0, timeZone);
    const nextMonth =
      prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 };
    const end = new Date(zonedLocalToUtc(nextMonth.year, nextMonth.month, 1, 0, 0, 0, timeZone).getTime() - 1000);
    return {
      start,
      end,
      label: `Le mois dernier (${String(prev.month).padStart(2, "0")}/${prev.year})`,
      timezone: timeZone,
      key,
    };
  }

  // this_year
  const start = zonedLocalToUtc(p.year, 1, 1, 0, 0, 0, timeZone);
  return {
    start,
    end: endOfShopDay(timeZone, now),
    label: `Cette année (${p.year})`,
    timezone: timeZone,
    key: "this_year",
  };
}

export function parsePeriodFromText(text: string): DatePeriod {
  const t = text.toLowerCase();
  if (/\bavant[- ]hier\b/.test(t)) return "day_before_yesterday";
  if (/\bhier\b/.test(t)) return "yesterday";
  if (/\baujourd['']hui\b|\bdu jour\b|\bce jour\b/.test(t)) return "today";
  if (/semaine derni[eè]re|la semaine pass[eée]e/.test(t)) return "last_week";
  if (/cette semaine/.test(t)) return "this_week";
  if (/mois dernier|mois pr[eé]c[eé]dent/.test(t)) return "last_month";
  if (/ce mois|mois[- ]ci/.test(t)) return "this_month";
  if (/cette ann[eé]e/.test(t)) return "this_year";
  if (/24\s*h|derni[eè]res?\s*24/.test(t)) return "last_24h";
  if (/7\s*derniers?\s*jours|derniers?\s*7\s*jours/.test(t)) return "last_7d";
  if (/30\s*derniers?\s*jours|derniers?\s*30\s*jours/.test(t)) return "last_30d";
  return "today";
}

export function formatMoneyEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatShopDateTime(date: Date, timeZone = DEFAULT_SHOP_TIMEZONE): string {
  return date.toLocaleString("fr-FR", { timeZone });
}
