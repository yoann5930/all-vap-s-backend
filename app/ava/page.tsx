"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

const ImmersiveAvaScreen = dynamic(
  () =>
    import("@/components/ai/ImmersiveAvaScreen").then((m) => m.ImmersiveAvaScreen),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black text-cyan-400/70">
        Chargement d&apos;A.V.A.…
      </div>
    ),
  }
);

/**
 * Page dédiée A.V.A. — plein écran uniquement.
 */
export default function AvaPage() {
  const router = useRouter();
  const onClose = useCallback(() => {
    router.push("/");
  }, [router]);

  return (
    <div className="fixed inset-0 z-[60] h-[100dvh] w-screen overflow-hidden bg-black">
      <ImmersiveAvaScreen onClose={onClose} />
    </div>
  );
}
