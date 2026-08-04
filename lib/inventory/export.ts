import ExcelJS from "exceljs";
import { formatEuroFromCents } from "@/lib/inventory/pricing";
import { statusLabel } from "@/lib/inventory/status";

export type ExportLine = {
  barcode: string | null;
  productName: string | null;
  brand: string | null;
  category: string | null;
  quantity: number;
  unitPriceCents: number | null;
  totalValueCents: number | null;
  storeName: string;
  employeeName: string;
  scannedAt: string | Date | null;
  photoUrl: string | null;
  notes: string | null;
};

export type ExportSessionMeta = {
  id: string;
  status: string;
  storeName: string;
  employeeName: string;
  startedAt: string | Date;
  completedAt?: string | Date | null;
};

function csvEscape(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildInventoryCsv(
  meta: ExportSessionMeta,
  lines: ExportLine[]
): string {
  const header = [
    "code-barres",
    "produit",
    "marque",
    "categorie",
    "quantite",
    "prix_unitaire",
    "valeur_totale",
    "boutique",
    "employe",
    "date_heure",
    "photo",
    "commentaire",
  ];
  const rows = lines.map((l) =>
    [
      l.barcode || "",
      l.productName || "",
      l.brand || "",
      l.category || "",
      String(l.quantity),
      l.unitPriceCents != null ? (l.unitPriceCents / 100).toFixed(2).replace(".", ",") : "",
      l.totalValueCents != null ? (l.totalValueCents / 100).toFixed(2).replace(".", ",") : "",
      l.storeName,
      l.employeeName,
      l.scannedAt ? new Date(l.scannedAt).toLocaleString("fr-FR") : "",
      l.photoUrl || "",
      l.notes || "",
    ]
      .map((c) => csvEscape(c))
      .join(";")
  );
  return [
    `# Inventaire ${meta.id} — ${statusLabel(meta.status)} — ${meta.storeName} — ${meta.employeeName}`,
    header.join(";"),
    ...rows,
  ].join("\n");
}

export async function buildInventoryExcel(
  meta: ExportSessionMeta,
  lines: ExportLine[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "All Vap's Inventaire";
  const sheet = wb.addWorksheet("Inventaire");
  sheet.columns = [
    { header: "Code-barres", key: "barcode", width: 16 },
    { header: "Produit", key: "product", width: 36 },
    { header: "Marque", key: "brand", width: 16 },
    { header: "Catégorie", key: "category", width: 16 },
    { header: "Quantité", key: "qty", width: 10 },
    { header: "Prix unitaire", key: "unit", width: 14 },
    { header: "Valeur totale", key: "total", width: 14 },
    { header: "Boutique", key: "store", width: 22 },
    { header: "Employé", key: "employee", width: 20 },
    { header: "Date/heure", key: "when", width: 20 },
    { header: "Photo", key: "photo", width: 40 },
    { header: "Commentaire", key: "notes", width: 30 },
  ];
  for (const l of lines) {
    sheet.addRow({
      barcode: l.barcode || "",
      product: l.productName || "",
      brand: l.brand || "",
      category: l.category || "",
      qty: l.quantity,
      unit: l.unitPriceCents != null ? l.unitPriceCents / 100 : null,
      total: l.totalValueCents != null ? l.totalValueCents / 100 : null,
      store: l.storeName,
      employee: l.employeeName,
      when: l.scannedAt ? new Date(l.scannedAt).toLocaleString("fr-FR") : "",
      photo: l.photoUrl || "",
      notes: l.notes || "",
    });
  }
  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** PDF minimal (texte) sans dépendance externe */
export function buildInventoryPdf(
  meta: ExportSessionMeta,
  lines: ExportLine[]
): Buffer {
  const escapePdf = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const title = `Inventaire ${meta.id}`;
  const subtitle = `${meta.storeName} — ${meta.employeeName} — ${statusLabel(meta.status)}`;
  const contentLines: string[] = [title, subtitle, ""];

  for (const l of lines) {
    contentLines.push(
      `${l.barcode || "—"} | ${l.productName || "Produit inconnu"} | qty=${l.quantity} | ${formatEuroFromCents(l.unitPriceCents)} | total=${formatEuroFromCents(l.totalValueCents)}`
    );
    if (l.photoUrl) contentLines.push(`  photo: ${l.photoUrl}`);
  }

  const fontSize = 9;
  const leading = 12;
  let y = 800;
  const textOps: string[] = ["BT", "/F1 9 Tf", "50 800 Td", `${leading} TL`];
  for (let i = 0; i < contentLines.length; i++) {
    const line = escapePdf(contentLines[i].slice(0, 110));
    if (i === 0) {
      textOps.push(`(${line}) Tj`);
    } else {
      textOps.push(`T* (${line}) Tj`);
    }
    y -= leading;
    if (y < 50) break;
  }
  textOps.push("ET");
  const stream = textOps.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj"
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream endobj`
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
