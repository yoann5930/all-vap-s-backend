/**
 * Repérage nom depuis une photo (côté client) :
 * 1) lit un éventuel code-barres dans l’image (BarcodeDetector / canvas)
 * 2) le serveur complète nom / gamme / prix depuis la mémoire catalogue
 */

export async function detectBarcodeFromImageFile(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // BarcodeDetector natif
    const BD = (window as unknown as {
      BarcodeDetector?: new (o?: { formats?: string[] }) => {
        detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
      };
    }).BarcodeDetector;

    if (typeof BD === "function") {
      try {
        const detector = new BD({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"],
        });
        const codes = await detector.detect(canvas);
        const raw = codes[0]?.rawValue?.trim();
        if (raw) return raw;
      } catch {
        /* fallback zxing */
      }
    }

    // ZXing OneD
    try {
      const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ]);
      const reader = new BrowserMultiFormatOneDReader(hints);
      const result = reader.decodeFromCanvas(canvas);
      const text = result.getText()?.trim();
      if (text) return text;
    } catch {
      /* aucun code */
    }
  } catch {
    return null;
  }

  return null;
}
