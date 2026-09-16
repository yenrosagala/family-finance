// ---------------------------------------------------------------------------
// OCR ADAPTER
// ---------------------------------------------------------------------------
// Camera capture is real: ScanScreen takes a photo / picks one from the
// library via expo-image-picker and passes the image (base64) in here.
//
// Image -> text recognition:
//   - Online: the image is POSTed to /api/receipt/ocr, which the Express API
//     proxies to the PaddleOCR-VL microservice (ocr_service/main.py).
//   - Offline / service down: falls back to a deterministic mock text blob so
//     the flow (capture → parse → confirm → save) still works end-to-end.
// The classifier is invoked client-side offline (global dictionary) and by
// /api/receipt/parse online, and guarantees categorical results regardless of
// the OCR source.
// ---------------------------------------------------------------------------

import { api } from './api';
import { Category, ParsedReceipt, Transaction, TransactionLineItem } from '../models';
import { isLocalMode } from '../core/dataSource';
import { localParseReceiptText, localSaveReceipt } from './local/receipt';

// The result we hand to the parser.
export interface OcrResult {
  text: string;
  source: 'mock' | 'camera';
}

// Convert a captured receipt photo into text using PaddleOCR-VL (server-side).
// Falls back to a deterministic sample blob when the service is unreachable so
// the full scan flow remains exercisable offline and in the sandbox.
export async function runOcrOnImage(image: { uri: string; base64?: string }): Promise<OcrResult> {
  if (image.base64) {
    try {
      const data = await api.post<{ text: string }>('/api/receipt/ocr', { image_base64: image.base64 });
      if (data.text && data.text.trim()) return { text: data.text, source: 'camera' };
    } catch (e) {
      console.warn('Server OCR unavailable, using fallback text:', (e as Error).message);
    }
  }
  // Offline / fallback path — deterministic so the pipeline is testable.
  const mockText = `Toko Sembako Makmur
Jl. Sudirman No. 123
Jakarta Selatan

Tanggal: 04/09/2026

Indomie Goreng x3     4500
Indomie Kuah Soto     1500
Teh Botol Sosro       3000
Aqua 600ml            2000
Bensin Pertalite      50000
Pulsa XL 25k          25000
Obat Paracetamol      8000
Sepatu Nike           450000
Subtotal              544000
Total                 544000`;

  return { text: mockText, source: 'mock' };
}

// Full scan-and-confirm helper: capture (or choose) -> OCR -> parse.
export async function scanReceipt(image: { uri: string; base64?: string }, categories?: Category[]): Promise<ParsedReceipt> {
  const ocr = await runOcrOnImage(image);
  return parseReceiptText(ocr.text, categories);
}

// Parse raw OCR text into a structured receipt (merchant, date, total, items,
// reconciliation, duplicate fingerprint). No DB write happens here.
// Offline (local mode) uses the on-device parser in services/local/receipt.ts;
// online (cloud mode) delegates to the API.
export async function parseReceiptText(ocrText: string, categories?: Category[]): Promise<ParsedReceipt> {
  if (await isLocalMode()) return localParseReceiptText(ocrText, categories || []);
  const data = await api.post<{ merchant: string | null; txn_date: string; total: number | null; line_items: any[]; receipt_fingerprint: string | null; reconciliation: any; duplicate_check: any }>(
    '/api/receipt/parse',
    { ocr_text: ocrText }
  );
  return data as unknown as ParsedReceipt;
}

export interface SaveReceiptInput {
  merchant_name: string | null;
  txn_date: string;
  total: number;
  from_account_id: string;
  category_id: string | null;
  line_items: Array<{
    raw_text: string;
    normalized_text: string | null;
    amount: number;
    category_id: string | null;
    categorization_source: 'exact' | 'fuzzy' | 'fallback' | 'manual' | null;
  }>;
  receipt_fingerprint: string | null;
  note: string | null;
}

// The confirm screen is the mandatory gate — nothing is written until the
// user reviews the OCR output and explicitly taps Save.
export async function saveReceipt(input: SaveReceiptInput): Promise<{ transaction: Transaction; line_items: TransactionLineItem[] }> {
  if (await isLocalMode()) return localSaveReceipt(input);
  return api.post<{ transaction: Transaction; line_items: TransactionLineItem[] }>('/api/receipt/save', input);
}