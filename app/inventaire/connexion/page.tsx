import { redirect } from "next/navigation";

/** Alias cahier des charges → login inventaire */
export default function InventaireConnexionPage() {
  redirect("/login?next=/inventaire");
}
