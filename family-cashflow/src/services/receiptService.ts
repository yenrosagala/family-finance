import { api } from './api';
import { ParsedReceipt } from '../models';

// ---------------------------------------------------------------------------
// OCR ADAPTER
// ---------------------------------------------------------------------------
// On a real device this calls ML Kit's TextRecognition. On this sandbox
// (no emulator/camera) we use a mock OCR that returns a deterministic raw
// text blob we can run through the same parse pipeline, so the whole flow is
// testable end-to-end without hardware. Swap `runOcrOnImage`'s body for the
// ML Kit call when camera support is wired in.
// ---------------------------------------------------------------------------

export type OcrSource = 'camera' | 'mock';

// The ML Kit TextRecognition result we consume.
export interface OcrResult {
  text: string;
  source: OcrSource;
}

export async function runOcrOnImage(_imageUri: string, _isMock = true): Promise<OcrResult> {
  // TODO(phase2): Replace with ML Kit's TextRecognizer when camera is available.
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

// ---------------------------------------------------------------------------
// RECEIPT API
// ---------------------------------------------------------------------------

// Parse raw OCR text into a structured receipt (merchant, date, total, items,
// reconciliation, duplicate fingerprint). No DB write happens here.
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt> {
  const data = await api.post<{ merchant: string | null; txn_date: string; total: number | null; line_items: any[]; receipt_fingerprint: string | null; reconciliation: any; duplicate_check: any }>(
    '/api/receipt/parse',
    { ocr_text: ocrText }
  );
  return data as unknown as ParsedReceipt;
}

// Save a confirmed receipt as an expense transaction (called only from the
// confirm screen AFTER the user reviews/edits — never automatically).
export async function saveReceipt(input: {
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
    categorization_source?: string | null;
  }>;
  receipt_fingerprint: string | null;
  note?: string | null;
}) {
  const data = await api.post<{ transaction: any; line_items: any[] }>('/api/receipt/save', input);
  return data;
}

// Full scan-and-confirm helper: capture (or mock) -> OCR -> parse.
export async function scanReceipt(imageUri: string): Promise<ParsedReceipt> {
  const ocr = await runOcrOnImage(imageUri);
  return parseReceiptText(ocr.text);
}
