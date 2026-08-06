import { redirect } from "next/navigation";

/** Alias cahier des charges → SPA inventaire (écran scan) */
export default function InventaireScanPage() {
  redirect("/inventaire");
}
