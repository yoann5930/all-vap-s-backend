import { redirect } from "next/navigation";

/** Alias cahier des charges → SPA inventaire (nouvelle session) */
export default function InventaireNouvelleSessionPage() {
  redirect("/inventaire");
}
