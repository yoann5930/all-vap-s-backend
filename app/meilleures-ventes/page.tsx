import { redirect } from "next/navigation";

export default function MeilleuresVentesPage() {
  redirect("/boutique?bestseller=true");
}
