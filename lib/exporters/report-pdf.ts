import { renderToBuffer } from "@react-pdf/renderer";

import {
  ResultsPdfDocument,
  type ResultsPdfDocumentProps,
} from "./report-pdf-document";

/**
 * Render PDF laporan hasil ujian di server Node (tanpa browser headless).
 * Layout ada di `report-pdf-document.tsx`; file ini tetap modul exporter murni
 * seperti pola Fase 4.
 */
export async function renderResultsPdf(
  props: ResultsPdfDocumentProps,
): Promise<Buffer> {
  return renderToBuffer(ResultsPdfDocument(props));
}
