import { Suspense } from "react";
import { HeroSection } from "@/components/home/HeroSection";
import { LiquidaromCollections } from "@/components/home/LiquidaromCollections";
import { AvaSidePanel } from "@/components/home/AvaSidePanel";
import { TrustBar } from "@/components/home/TrustBar";
import { StoresSection } from "@/components/home/StoresSection";
import { ProductCatalog } from "@/components/shop/ProductCatalog";

/** Layout maquette : hero+collections+catalogue, A.V.A. sticky à droite */
export function HomeShowcase() {
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            <HeroSection />
            <LiquidaromCollections />
            <Suspense
              fallback={
                <div className="py-12 text-center text-[#A7B0BC]">
                  Chargement du catalogue…
                </div>
              }
            >
              <ProductCatalog
                defaultCategory="e-liquides"
                heading="E-LIQUIDES"
                showAvaPanel={false}
                embedded
              />
            </Suspense>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-36">
              <AvaSidePanel />
            </div>
          </aside>
        </div>
      </div>

      <div className="mt-8 lg:mt-10">
        <TrustBar />
      </div>

      <StoresSection />
    </>
  );
}
