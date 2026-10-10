import { PDFParse } from "pdf-parse";

/** Plain text of a PDF (pdf-parse v2 class API), with runs of blank lines collapsed. */
export async function extractPdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return String(result.text || "")
      .replace(/^-- \d+ of \d+ --$/gm, "") // page separators added by getText()
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
