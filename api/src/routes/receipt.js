import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';
import { createHash } from 'crypto';
import { categorizeText } from '../services/categorizeText.js';

const router = Router();

async function getHouseholdId(userId) {
  const { rows } = await pool.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rows[0]?.household_id || null;
}

// Normalize a line of OCR text: trim, collapse whitespace, lowercase
function normalizeLine(line) {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Extract a date from text (supports common Indonesian receipt formats)
function extractDate(text) {
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    let [, day, month, year] = dmy;
    if (year.length === 2) year = '20' + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  const ymd = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return null;
}

// Extract merchant name: first non-empty meaningful line or keyword "TOKO"/"MERCHANT"
function extractMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    const n = normalizeLine(line);
    if (n.length < 2) continue;
    if (/^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card)/i.test(n)) continue;
    return line.trim();
  }
  return null;
}

// Extract total amount: look for "TOTAL", "GRAND TOTAL", "BAYAR", etc.
function extractTotal(lines) {
  const keywords = [
    /grand\s*total/i,
    /total\s*(?:belanja|bayar|harga)?/i,
    /bayar\s*(?:total|harga)?/i,
    /jumlah/i,
    /amount\s*due/i,
    /total.*due/i,
  ];
  // Search from bottom up — total is usually near the end
  for (let i = lines.length - 1; i >= 0; i--) {
    const n = normalizeLine(lines[i]);
    for (const kw of keywords) {
      if (kw.test(n)) {
        const numMatch = n.match(/[\d.,]+$/);
        if (numMatch) {
          return parseFloat(numMatch[0].replace(/\./g, '').replace(',', '.')) || null;
        }
        // Amount might be on the next line
        if (i + 1 < lines.length) {
          const nextNum = lines[i + 1].trim().match(/[\d.,]+/);
          if (nextNum) {
            return parseFloat(nextNum[0].replace(/\./g, '').replace(',', '.')) || null;
          }
        }
      }
    }
  }
  // Fallback: find largest number in the text
  const allNums = [];
  for (const line of lines) {
    const matches = line.matchAll(/\b\d[\d.,]*\d\b/g);
    for (const m of matches) {
      const val = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0) allNums.push(val);
    }
  }
  return allNums.length > 0 ? Math.max(...allNums) : null;
}

// Extract line items: lines with both text and an amount
function extractLineItems(lines) {
  const items = [];
  const skipKeywords = /^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card|ppn|pajak|service|tax|tip|discount|diskon|no|struk|faktur|nota|tanggal|date|time|waktu)/i;
  const addressPattern = /^(jl\.|jalan|no\.|rt|rw|kelurahan|kecamatan|kota|kabupaten|provinsi|indonesia)/i;

  for (const line of lines) {
    const n = normalizeLine(line);
    if (n.length < 3) continue;
    if (skipKeywords.test(n)) continue;
    if (addressPattern.test(n)) continue;

    // Try to extract: "item text  12345" or "item text  x2  12345"
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

// POST /api/receipt/parse — parse raw OCR text into structured receipt data
router.post('/parse', authRequired, async (req, res) => {
  const { ocr_text } = req.body || {};
  if (!ocr_text || typeof ocr_text !== 'string') {
    return res.status(400).json({ error: 'ocr_text string is required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const lines = ocr_text.split('\n').filter(l => l.trim());
  const merchant = extractMerchant(lines);
  const txn_date = extractDate(ocr_text) || new Date().toISOString().slice(0, 10);
  const total = extractTotal(lines);
  const lineItems = extractLineItems(lines);

  // Categorize each line item (exact -> fuzzy -> global -> ML -> fallback)
  const categorized = [];
  for (const item of lineItems) {
    const normalized = item.raw_text.toLowerCase().trim();
    const result = await categorizeText(pool, householdId, normalized);

    // Learning: bump confirmation counts for dictionary-backed matches (exact/fuzzy).
    if (result.dictionary_id && (result.source === 'exact' || result.source === 'fuzzy')) {
      const isExact = result.source === 'exact';
      await pool.query(
        `UPDATE item_dictionary
         SET times_confirmed = times_confirmed + 1,
             confidence = LEAST(1.0, confidence + $1), last_used = now()
         WHERE id = $2`,
        [isExact ? 0.05 : 0.03, result.dictionary_id]
      );
      if (isExact) result.confidence = Number(result.confidence) + 0.05;
    }

    categorized.push({
      ...item,
      normalized_text: item.raw_text,
      category_id: result.category_id,
      category_name: result.category_name,
      category_color: result.category_color,
      categorization_source: result.source,
      confidence: result.confidence,
    });
  }

  // Reconciliation: sum of line items vs total
  const lineItemsSum = categorized.reduce((s, i) => s + i.amount, 0);
  const reconciliation = {
    line_items_count: categorized.length,
    line_items_sum: lineItemsSum,
    printed_total: total,
    is_reconciled: total !== null ? Math.abs(lineItemsSum - total) < 1 : null,
    discrepancy: total !== null ? Math.abs(lineItemsSum - total) : null,
  };

  // Duplicate fingerprint: hash(merchant + total + date + item_count)
  let receipt_fingerprint = null;
  if (merchant && total !== null) {
    receipt_fingerprint = createHash('sha256')
      .update(`${merchant.toLowerCase().trim()}|${total}|${txn_date}|${categorized.length}`)
      .digest('hex')
      .slice(0, 16);
  }

  // Check for duplicate fingerprint
  let is_duplicate = false;
  let existing_transaction_id = null;
  if (receipt_fingerprint) {
    const { rows: dupes } = await pool.query(
      `SELECT id FROM transactions
       WHERE household_id = $1 AND receipt_fingerprint = $2`,
      [householdId, receipt_fingerprint]
    );
    if (dupes.length > 0) {
      is_duplicate = true;
      existing_transaction_id = dupes[0].id;
    }
  }

  return res.json({
    merchant,
    txn_date,
    total,
    line_items: categorized,
    receipt_fingerprint,
    reconciliation,
    duplicate_check: { is_duplicate, existing_transaction_id },
  });
});

// POST /api/receipt/save — save a parsed receipt as a transaction (with confirmation)
router.post('/save', authRequired, async (req, res) => {
  const {
    merchant_name, txn_date, total, from_account_id, category_id,
    line_items, receipt_fingerprint, note,
  } = req.body || {};

  if (!total || total <= 0) {
    return res.status(400).json({ error: 'positive total is required' });
  }
  if (!from_account_id) {
    return res.status(400).json({ error: 'from_account_id is required' });
  }

  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert transaction
    const { rows: txRows } = await client.query(
      `INSERT INTO transactions
        (household_id, type, amount, txn_date, note, added_by,
         category_id, from_account_id, merchant_name,
         categorization_source, receipt_fingerprint)
       VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        householdId, total, txn_date || new Date().toISOString().slice(0, 10),
        note || null, req.user.id,
        category_id || null, from_account_id,
        merchant_name || null,
        line_items?.length ? 'exact' : 'manual',
        receipt_fingerprint || null,
      ]
    );
    const txn = txRows[0];

    // Insert line items
    const savedLineItems = [];
    if (Array.isArray(line_items)) {
      for (const item of line_items) {
        const { rows: liRows } = await client.query(
          `INSERT INTO transaction_line_items
            (transaction_id, raw_text, normalized_text, amount, category_id, categorization_source)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            txn.id,
            item.raw_text || item.normalized_text || '',
            item.normalized_text || item.raw_text || '',
            item.amount,
            item.category_id || null,
            item.categorization_source || 'manual',
          ]
        );
        savedLineItems.push(liRows[0]);
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ transaction: txn, line_items: savedLineItems });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
