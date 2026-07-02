"use client";

export function PremiumBackground() {
  return (
    <div className="premium-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="premium-bg-base absolute inset-0 bg-[#050505]" />
      <div className="premium-bg-orb premium-bg-orb-1" />
      <div className="premium-bg-orb premium-bg-orb-2" />
      <div className="premium-bg-orb premium-bg-orb-3" />
      <div className="premium-bg-grid absolute inset-0" />
      <div className="premium-bg-particles absolute inset-0" />
    </div>
  );
}
