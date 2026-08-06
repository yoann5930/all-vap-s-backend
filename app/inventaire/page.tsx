import type { Metadata } from "next";
import { EmployeeInventoryApp } from "@/components/inventory/EmployeeInventoryApp";
import { InventoryServiceWorker } from "@/components/inventory/InventoryServiceWorker";

export const metadata: Metadata = {
  title: "Inventaire All Vap's",
  description: "Comptage stock Hautmont et Le Quesnoy — accès employés",
  manifest: "/manifest-inventaire.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Inventaire All Vap's",
    statusBarStyle: "default",
  },
};

export default function InventairePage() {
  return (
    <>
      <InventoryServiceWorker />
      <EmployeeInventoryApp />
    </>
  );
}
