import { redirect } from "next/navigation";

export default function NouveautesPage() {
  redirect("/boutique?new=true");
}
