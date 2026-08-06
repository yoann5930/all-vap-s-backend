"use client";

import { AvaControlPanel } from "@/components/admin/fidelatoo/AvaControlPanel";

export default function FidelatooAvaPage() {
  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Zone réservée à Yoann et aux administrateurs — parcours collaboratrice A.V.A. sur la VM Android.
      </p>
      <AvaControlPanel />
    </div>
  );
}
