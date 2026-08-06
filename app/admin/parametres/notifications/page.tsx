import { redirect } from "next/navigation";

/** Alias demandé : Paramètres > Notifications */
export default function NotificationsSettingsAlias() {
  redirect("/admin/notifications");
}
