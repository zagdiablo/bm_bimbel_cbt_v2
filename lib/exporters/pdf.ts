import { renderToBuffer } from "@react-pdf/renderer";

import {
  QuestionsPdfDocument,
  type QuestionsPdfDocumentProps,
} from "./pdf-document";

/**
 * Render PDF di server Node (tanpa browser headless). Layout ada di
 * `pdf-document.tsx` supaya file ini tetap berupa modul exporter murni.
 *
 * Komponen dipanggil langsung (bukan lewat elemen root) karena renderer
 * react-pdf hanya menerima elemen `<Document>` sebagai root.
 */
export async function renderQuestionsPdf(
  props: QuestionsPdfDocumentProps,
): Promise<Buffer> {
  return renderToBuffer(QuestionsPdfDocument(props));
}
