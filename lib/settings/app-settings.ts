import prisma from "@/lib/prisma";
import { DEFAULT_SHOP_TIMEZONE } from "@/lib/timezone/shop-tz";

export const SETTINGS_KEYS = {
  REPORTS: "ava.reports",
  NOTIFICATIONS: "ava.notifications",
  OWNER_PHONE: "ava.owner_phone",
} as const;

export type ReportSettings = {
  dailyEnabled: boolean;
  dailyTime: string; // HH:mm
  timezone: string;
  recipientEmail: string;
  pdfEnabled: boolean;
  sendEvenWithoutPurchase: boolean;
  weeklyEnabled: boolean;
  weeklyDay: number; // 1=lundi
  monthlyEnabled: boolean;
  monthlyDay: number;
  retentionDays: number;
  includedSections: string[];
};

export type NotificationSettings = {
  enabled: boolean;
  adminChannel: boolean;
  emailChannel: boolean;
  pushChannel: boolean;
  smsChannel: boolean;
  androidGatewayChannel: boolean;
  alertNewOrder: boolean;
  alertPayment: boolean;
  alertStock: boolean;
  alertShipping: boolean;
  alertTechnical: boolean;
  alertSecurity: boolean;
  dailyReportNotify: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  criticalBypassQuietHours: boolean;
  maxSmsPerDay: number;
  fallbackChannel: "email" | "admin" | "none";
};

export type OwnerPhoneSettings = {
  countryCode: string;
  nationalNumber: string;
  validated: boolean;
  validatedAt: string | null;
  status: "unvalidated" | "pending" | "validated" | "revoked";
  preferredChannel: "admin" | "email" | "push" | "sms";
  primaryDeviceLabel: string | null;
  gatewayDeviceLabel: string | null;
  deviceModel: string | null;
  customName: string | null;
};

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  dailyEnabled: process.env.DAILY_REPORT_ENABLED !== "false",
  dailyTime: process.env.DAILY_REPORT_TIME || "20:30",
  timezone: process.env.DAILY_REPORT_TIMEZONE || DEFAULT_SHOP_TIMEZONE,
  recipientEmail: process.env.DAILY_REPORT_RECIPIENT || "allvaps70@gmail.com",
  pdfEnabled: process.env.DAILY_REPORT_PDF_ENABLED !== "false",
  sendEvenWithoutPurchase: false,
  weeklyEnabled: false,
  weeklyDay: 1,
  monthlyEnabled: false,
  monthlyDay: 1,
  retentionDays: 365,
  includedSections: [
    "summary",
    "preparation",
    "shipping",
    "sales",
    "stock",
    "documents",
    "emails",
    "customers",
    "alerts",
  ],
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: process.env.NOTIFICATIONS_ENABLED !== "false",
  adminChannel: true,
  emailChannel: true,
  pushChannel: false,
  smsChannel: false,
  androidGatewayChannel: false,
  alertNewOrder: true,
  alertPayment: true,
  alertStock: true,
  alertShipping: true,
  alertTechnical: true,
  alertSecurity: true,
  dailyReportNotify: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  criticalBypassQuietHours: true,
  maxSmsPerDay: 20,
  fallbackChannel: "email",
};

export const DEFAULT_OWNER_PHONE: OwnerPhoneSettings = {
  countryCode: "+33",
  nationalNumber: "",
  validated: false,
  validatedAt: null,
  status: "unvalidated",
  preferredChannel: "admin",
  primaryDeviceLabel: null,
  gatewayDeviceLabel: null,
  deviceModel: null,
  customName: null,
};

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.valueJson || typeof row.valueJson !== "object") return { ...fallback };
    return { ...fallback, ...(row.valueJson as object) } as T;
  } catch {
    return { ...fallback };
  }
}

async function setJson<T>(key: string, value: T, updatedBy?: string): Promise<T> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, valueJson: value as object, updatedBy },
    update: { valueJson: value as object, updatedBy },
  });
  return value;
}

export async function getReportSettings(): Promise<ReportSettings> {
  return getJson(SETTINGS_KEYS.REPORTS, DEFAULT_REPORT_SETTINGS);
}

export async function setReportSettings(
  patch: Partial<ReportSettings>,
  updatedBy?: string
): Promise<ReportSettings> {
  const current = await getReportSettings();
  return setJson(SETTINGS_KEYS.REPORTS, { ...current, ...patch }, updatedBy);
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const base = await getJson(SETTINGS_KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATION_SETTINGS);
  // Canaux push/SMS restent off tant que providers non configurés
  if (!process.env.PUSH_ENABLED || process.env.PUSH_ENABLED === "false") {
    base.pushChannel = false;
  }
  if (!process.env.SMS_ENABLED || process.env.SMS_ENABLED === "false") {
    base.smsChannel = false;
  }
  if (!process.env.ANDROID_GATEWAY_ENABLED || process.env.ANDROID_GATEWAY_ENABLED === "false") {
    base.androidGatewayChannel = false;
  }
  return base;
}

export async function setNotificationSettings(
  patch: Partial<NotificationSettings>,
  updatedBy?: string
): Promise<NotificationSettings> {
  const current = await getNotificationSettings();
  return setJson(SETTINGS_KEYS.NOTIFICATIONS, { ...current, ...patch }, updatedBy);
}

export async function getOwnerPhoneSettings(): Promise<OwnerPhoneSettings> {
  const stored = await getJson(SETTINGS_KEYS.OWNER_PHONE, DEFAULT_OWNER_PHONE);
  if (!stored.nationalNumber && process.env.SMS_OWNER_PHONE) {
    // Env peut préremplir — jamais validé automatiquement
    const raw = process.env.SMS_OWNER_PHONE.replace(/\s+/g, "");
    const m = raw.match(/^(\+\d{1,3})?(.*)$/);
    if (m) {
      stored.countryCode = m[1] || stored.countryCode;
      stored.nationalNumber = (m[2] || "").replace(/\D/g, "");
    }
  }
  return stored;
}

export async function setOwnerPhoneSettings(
  patch: Partial<OwnerPhoneSettings>,
  updatedBy?: string
): Promise<OwnerPhoneSettings> {
  const current = await getOwnerPhoneSettings();
  const next = { ...current, ...patch };
  // Pas de fausse validation
  if (patch.nationalNumber !== undefined && patch.nationalNumber !== current.nationalNumber) {
    next.validated = false;
    next.validatedAt = null;
    next.status = "unvalidated";
  }
  return setJson(SETTINGS_KEYS.OWNER_PHONE, next, updatedBy);
}

export function maskPhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "Numéro non renseigné";
  const last2 = digits.slice(-2);
  return `${countryCode} • •• •• •• ${last2}`;
}
