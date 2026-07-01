import { AccountSidebar } from "@/components/account/AccountSidebar";

export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Mon compte</h1>
      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <div className="lg:w-56">
          <AccountSidebar />
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
