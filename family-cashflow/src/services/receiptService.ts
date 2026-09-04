// ---------------------------------------------------------------------------
// OCR ADAPTER
// ---------------------------------------------------------------------------
// On a real device this calls ML Kit's TextRecognition.
// On this sandbox (no ML Kit available) we use a mock OCR that returns a
// deterministic raw text blob we can run through the same parse pipeline,
// so the whole flow is testable end-to-end without hardware.
// The ML classifier (Naive Bayes) is invoked via /api/categorize and is
// guaranteed to work regardless of the OCR source — mock or camera.
// Swap runOcrOnImage's body for the ML Kit call when camera + ML Kit are available.
// ---------------------------------------------------------------------------

import { api } from './api';
import { ParsedReceipt } from '../models';

// The ML Kit TextRecognition result we consume.
export interface OcrResult {
  text: string;
  source: 'mock' | 'camera';
}

// TODO(phase2): Replace with ML Kit's TextRecognizer when camera + ML Kit are available.
// Currently returns a deterministic mock text blob so the whole flow
// (parse → categorize → confirm) works end-to-end without hardware.
// The classifyText shared function (used by both /api/categorize and /api/receipt/parse)
// guarantees categorical results (exact → fuzzy → global → ML → fallback) regardless
// of the OCR source.
export async function runOcrOnImage(_image: { uri: string }): Promise<OcrResult> {
  // Mock path — used during development/sandbox testing.
  // In a real app with ML Kit, this would call ML Kit's TextRecognizer.
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
export async function scanReceipt(imageUri: string): Promise<ParsedReceipt> {
  const ocr = await runOcrOnImage({ uri: imageUri });
  return parseReceiptText(ocr.text);
}

// Parse raw OCR text into a structured receipt (merchant, date, total, items,
// reconciliation, duplicate fingerprint). No DB write happens here.
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt> {
  const data = await api.post<{ merchant: string | null; txn_date: string; total: number | null; line_items: any[]; receipt_fingerprint: string | null; reconciliation: any; duplicate_check: any }>(
    '/api/receipt/parse',
    { ocr_text: ocrText }
  );
  return data as unknown as ParsedReceipt;
}