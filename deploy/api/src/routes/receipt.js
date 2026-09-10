import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';
import { createHash } from 'crypto';
import { categorizeText } from '../services/categorizeText.js';
import { extractDate, extractMerchant, extractTotal, extractLineItems } from '../services/local/receiptParser.js';
import { validateMoneyFields } from '../services/validateMoneyFields.js';

// PaddleOCR-VL microservice (ocr_service/main.py). Image -> recognized text.
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8008';
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 180000);

const router = Router();

// POST /api/receipt/ocr — proxy a receipt photo to the PaddleOCR-VL service.
// Intentionally NOT authed: it is a stateless image->text utility (mirrors the
// unauthenticated OCR service) and writes no household data. parse/save below are authed.
router.post('/ocr', async (req, res) => {
  const { image_base64 } = req.body || {};
  if (!image_base64 || typeof image_base64 !== 'string') {
    return res.status(400).json({ error: 'image_base64 string is required' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64 }),
      signal: controller.signal,
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      const detail = data.detail || data.error || 'OCR service error';
      return res.status(upstream.status).json({ error: detail });
    }
    if (!data.text || !data.text.trim()) {
      return res.status(502).json({ error: 'OCR service returned no text' });
    }
    return res.json({ text: data.text, source: 'paddleocr-vl' });
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'OCR service timed out' : `OCR service unavailable: ${e.message}`;
    return res.status(503).json({ error: msg });
  } finally {
    clearTimeout(timer);
  }
});

async function getHouseholdId(userId) {
  const { rows } = await pool.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rows[0]?.household_id || null;
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
  if (Array.isArray(line_items)) {
    for (const item of line_items) {
      const amt = item && Number(item.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'each line item amount must be a positive number' });
      }
    }
  }

  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const client = await pool.connect();
  try {
    await validateMoneyFields(client, householdId, {
      type: 'expense',
      amount: total,
      from_account_id,
      category_id,
    });
    await client.query('BEGIN');

    // Server-side duplicate re-check (atomic with insert, not trusting the
    // client-supplied parse result).
    if (receipt_fingerprint) {
      const { rows: dupes } = await client.query(
        `select id from transactions where household_id = $1 and receipt_fingerprint = $2 limit 1`,
        [householdId, receipt_fingerprint]
      );
      if (dupes.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Duplicate receipt already saved',
          existing_transaction_id: dupes[0].id,
        });
      }
    }

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
    return res.status(201).json({
      transaction: { ...txn, amount: Number(txn.amount) },
      line_items: savedLineItems,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
