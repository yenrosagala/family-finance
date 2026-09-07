import * as Crypto from 'expo-crypto';
import { getLocalDb } from './database';
import { localCreateTransaction } from './repository';
import { Category, ParsedLineItem, ParsedReceipt, Transaction, TransactionLineItem } from '../../models';
import { categorizeWithGlobalDictionary } from '../categorizationService';

// Local (offline) receipt pipeline — parity with api/src/routes/receipt.js.
// The extraction functions are pure-so that the confirm screen behaves the
// same whether OCR text was parsed on-device or by the API.

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractDate(text: string): string | null {
  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    let [, day, month, year] = dmy;
    if (year.length === 2) year = '20' + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const ymd = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return null;
}

function extractMerchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 5)) {
    const n = normalizeLine(line);
    if (n.length < 2) continue;
    if (/^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card)/i.test(n)) continue;
    return line.trim();
  }
  return null;
}

function extractTotal(lines: string[]): number | null {
  const keywords = [
    /grand\s*total/i,
    /total\s*(?:belanja|bayar|harga)?/i,
    /bayar\s*(?:total|harga)?/i,
    /jumlah/i,
    /amount\s*due/i,
    /total.*due/i,
  ];
  for (let i = lines.length - 1; i >= 0; i--) {
    const n = normalizeLine(lines[i]);
    for (const kw of keywords) {
      if (kw.test(n)) {
        const numMatch = n.match(/[\d.,]+$/);
        if (numMatch) {
          return parseFloat(numMatch[0].replace(/\./g, '').replace(',', '.')) || null;
        }
        if (i + 1 < lines.length) {
          const nextNum = lines[i + 1].trim().match(/[\d.,]+/);
          if (nextNum) {
            return parseFloat(nextNum[0].replace(/\./g, '').replace(',', '.')) || null;
          }
        }
      }
    }
  }
  const allNums: number[] = [];
  for (const line of lines) {
    const matches = line.matchAll(/\b\d[\d.,]*\d\b/g);
    for (const m of matches) {
      const val = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0) allNums.push(val);
    }
  }
  return allNums.length > 0 ? Math.max(...allNums) : null;
}

function extractLineItems(lines: string[]): Array<{ raw_text: string; amount: number }> {
  const items: Array<{ raw_text: string; amount: number }> = [];
  const skipKeywords = /^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card|ppn|pajak|service|tax|tip|discount|diskon|no|struk|faktur|nota|tanggal|date|time|waktu)/i;
  const addressPattern = /^(jl\.|jalan|no\.|rt|rw|kelurahan|kecamatan|kota|kabupaten|provinsi|indonesia)/i;

  for (const line of lines) {
    const n = normalizeLine(line);
    if (n.length < 3) continue;
    if (skipKeywords.test(n)) continue;
    if (addressPattern.test(n)) continue;

    const itemMatch = n.match(/^(.+?)\s+(?:x\d+\s+)?[\s:]*(\d[\d.,]*)\s*$/);
    if (itemMatch) {
      const rawText = itemMatch[1].trim();
      const amount = parseFloat(itemMatch[2].replace(/\./g, '').replace(',', '.'));
      if (amount > 0 && rawText.length >= 2) {
        items.push({ raw_text: rawText, amount });
      }
    }
  }
  return items;
}

async function fingerprint(
  merchant: string,
  total: number,
  txnDate: string,
  itemCount: number
): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${merchant.toLowerCase().trim()}|${total}|${txnDate}|${itemCount}`
  );
  return digest.slice(0, 16);
}

export async function localParseReceiptText(
  ocrText: string,
  categories: Category[] = []
): Promise<ParsedReceipt> {
  const lines = ocrText.split('\n').filter((l) => l.trim());
  const merchant = extractMerchant(lines);
  const txn_date = extractDate(ocrText) || new Date().toISOString().slice(0, 10);
  const total = extractTotal(lines);
  const rawItems = extractLineItems(lines);

  const line_items: ParsedLineItem[] = rawItems.map((item) => {
    const result = categorizeWithGlobalDictionary(item.raw_text, categories);
    return {
      raw_text: item.raw_text,
      normalized_text: item.raw_text,
      amount: item.amount,
      category_id: result.category_id,
      category_name: result.category_name,
      category_color: result.category_color,
      categorization_source: result.source,
      confidence: result.confidence,
    };
  });

  const lineItemsSum = line_items.reduce((s, i) => s + i.amount, 0);
  const reconciliation = {
    line_items_count: line_items.length,
    line_items_sum: lineItemsSum,
    printed_total: total,
    is_reconciled: total !== null ? Math.abs(lineItemsSum - total) < 1 : null,
    discrepancy: total !== null ? Math.abs(lineItemsSum - total) : null,
  };

  let receipt_fingerprint: string | null = null;
  if (merchant && total !== null) {
    receipt_fingerprint = await fingerprint(merchant, total, txn_date, line_items.length);
  }

  let is_duplicate = false;
  let existing_transaction_id: string | null = null;
  if (receipt_fingerprint) {
    const db = await getLocalDb();
    const row = await db.getFirstAsync<{ id: string }>(
      `select id from transactions where receipt_fingerprint = ? limit 1`,
      [receipt_fingerprint]
    );
    if (row) {
      is_duplicate = true;
      existing_transaction_id = row.id;
    }
  }

  return {
    merchant,
    txn_date,
    total,
    line_items,
    receipt_fingerprint,
    reconciliation,
    duplicate_check: { is_duplicate, existing_transaction_id },
  };
}

export interface LocalSaveReceiptInput {
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

export async function localSaveReceipt(
  input: LocalSaveReceiptInput
): Promise<{ transaction: Transaction; line_items: TransactionLineItem[] }> {
  const firstWithCategory = input.line_items.find((it) => it.category_id);
  const transaction = await localCreateTransaction({
    type: 'expense',
    amount: input.total,
    txn_date: input.txn_date,
    note: input.note || null,
    category_id: input.category_id || firstWithCategory?.category_id || null,
    from_account_id: input.from_account_id,
    merchant_name: input.merchant_name || null,
    categorization_source: input.line_items.length ? 'exact' : 'manual',
    receipt_fingerprint: input.receipt_fingerprint || null,
  });
  return { transaction, line_items: [] };
}