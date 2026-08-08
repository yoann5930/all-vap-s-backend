import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A.V.A. Admin — All Vap's",
  robots: { index: false, follow: false },
};

export default function AdminAvaSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
