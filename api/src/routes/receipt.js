import { Router } from 'express';
import { createHash } from 'crypto';
import { categorizeText } from '../services/categorizeText.js';

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8008';
const OCR_TIMEOUT_MS  = Number(process.env.OCR_TIMEOUT_MS || 180000);

const router = Router();

// POST /api/receipt/ocr — stateless, no household data written; skip auth intentionally
router.post('/ocr', async (req, res) => {
  const { image_base64 } = req.body || {};
  if (!image_base64 || typeof image_base64 !== 'string')
    return res.status(400).json({ error: 'image_base64 string is required' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64 }), signal: controller.signal,
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.detail || data.error || 'OCR service error' });
    if (!data.text || !data.text.trim()) return res.status(502).json({ error: 'OCR service returned no text' });
    return res.json({ text: data.text, source: 'paddleocr-vl' });
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'OCR service timed out' : `OCR service unavailable: ${e.message}`;
    return res.status(503).json({ error: msg });
  } finally {
    clearTimeout(timer);
  }
});

function normalizeLine(line) { return line.replace(/\s+/g, ' ').trim().toLowerCase(); }

function extractDate(text) {
  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) { let [, day, month, year] = dmy; if (year.length === 2) year = '20' + year; return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; }
  const ymd = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return null;
}

function extractMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    const n = normalizeLine(line);
    if (n.length < 2) continue;
    if (/^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card)/i.test(n)) continue;
    return line.trim();
  }
  return null;
}

function extractTotal(lines) {
  const keywords = [/grand\s*total/i, /total\s*(?:belanja|bayar|harga)?/i, /bayar\s*(?:total|harga)?/i, /jumlah/i, /amount\s*due/i, /total.*due/i];
  for (let i = lines.length - 1; i >= 0; i--) {
    const n = normalizeLine(lines[i]);
    for (const kw of keywords) {
      if (kw.test(n)) {
        const numMatch = n.match(/[\d.,]+$/);
        if (numMatch) return parseFloat(numMatch[0].replace(/\./g, '').replace(',', '.')) || null;
        if (i + 1 < lines.length) { const nextNum = lines[i + 1].trim().match(/[\d.,]+/); if (nextNum) return parseFloat(nextNum[0].replace(/\./g, '').replace(',', '.')) || null; }
      }
    }
  }
  const allNums = [];
  for (const line of lines) { const matches = line.matchAll(/\b\d[\d.,]*\d\b/g); for (const m of matches) { const val = parseFloat(m[0].replace(/\./g, '').replace(',', '.')); if (!isNaN(val) && val > 0) allNums.push(val); } }
  return allNums.length > 0 ? Math.max(...allNums) : null;
}

function extractLineItems(lines) {
  const items = [];
  const skipKeywords = /^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card|ppn|pajak|service|tax|tip|discount|diskon|no|struk|faktur|nota|tanggal|date|time|waktu)/i;
  const addressPattern = /^(jl\.|jalan|no\.|rt|rw|kelurahan|kecamatan|kota|kabupaten|provinsi|indonesia)/i;
  for (const line of lines) {
    const n = normalizeLine(line);
    if (n.length < 3 || skipKeywords.test(n) || addressPattern.test(n)) continue;
    const itemMatch = n.match(/^(.+?)\s+(?:x\d+\s+)?[\s:]*([\d.,]*)\s*$/);
    if (itemMatch) {
      const rawText = itemMatch[1].trim();
      const amount = parseFloat(itemMatch[2].replace(/\./g, '').replace(',', '.'));
      if (amount > 0 && rawText.length >= 2) items.push({ raw_text: rawText, amount });
    }
  }
  return items;
}

// POST /api/receipt/parse
router.post('/parse', async (req, res) => {
  const { ocr_text } = req.body || {};
  if (!ocr_text || typeof ocr_text !== 'string')
    return res.status(400).json({ error: 'ocr_text string is required' });

  const lines      = ocr_text.split('\n').filter(l => l.trim());
  const merchant   = extractMerchant(lines);
  const txn_date   = extractDate(ocr_text) || new Date().toISOString().slice(0, 10);
  const total      = extractTotal(lines);
  const lineItems  = extractLineItems(lines);

  const categorized = [];
  for (const item of lineItems) {
    const normalized = item.raw_text.toLowerCase().trim();
    const result = await categorizeText(req.householdDb, req.householdId, normalized);
    if (result.dictionary_id && (result.source === 'exact' || result.source === 'fuzzy')) {
      const isExact = result.source === 'exact';
      await req.householdDb.query(
        `UPDATE item_dictionary SET times_confirmed = times_confirmed + 1,
             confidence = LEAST(1.0, confidence + $1), last_used = now() WHERE id = $2`,
        [isExact ? 0.05 : 0.03, result.dictionary_id]
      );
      if (isExact) result.confidence = Number(result.confidence) + 0.05;
    }
    categorized.push({ ...item, normalized_text: item.raw_text,
      category_id: result.category_id, category_name: result.category_name,
      category_color: result.category_color, categorization_source: result.source, confidence: result.confidence });
  }

  const lineItemsSum = categorized.reduce((s, i) => s + i.amount, 0);
  const reconciliation = {
    line_items_count: categorized.length, line_items_sum: lineItemsSum, printed_total: total,
    is_reconciled: total !== null ? Math.abs(lineItemsSum - total) < 1 : null,
    discrepancy: total !== null ? Math.abs(lineItemsSum - total) : null,
  };

  let receipt_fingerprint = null;
  if (merchant && total !== null) {
    receipt_fingerprint = createHash('sha256')
      .update(`${merchant.toLowerCase().trim()}|${total}|${txn_date}|${categorized.length}`)
      .digest('hex').slice(0, 16);
  }

  let is_duplicate = false, existing_transaction_id = null;
  if (receipt_fingerprint) {
    const { rows: dupes } = await req.householdDb.query(
      `SELECT id FROM transactions WHERE household_id = $1 AND receipt_fingerprint = $2`,
      [req.householdId, receipt_fingerprint]
    );
    if (dupes.length > 0) { is_duplicate = true; existing_transaction_id = dupes[0].id; }
  }

  return res.json({ merchant, txn_date, total, line_items: categorized, receipt_fingerprint,
    reconciliation, duplicate_check: { is_duplicate, existing_transaction_id } });
});

// POST /api/receipt/save
router.post('/save', async (req, res) => {
  const { merchant_name, txn_date, total, from_account_id, category_id, line_items, receipt_fingerprint, note } = req.body || {};
  if (!total || total <= 0) return res.status(400).json({ error: 'positive total is required' });
  if (!from_account_id)    return res.status(400).json({ error: 'from_account_id is required' });

  const client = await req.householdDb.connect();
  try {
    await client.query('BEGIN');
    const { rows: txRows } = await client.query(
      `INSERT INTO transactions
        (household_id, type, amount, txn_date, note, added_by, category_id, from_account_id,
         merchant_name, categorization_source, receipt_fingerprint)
       VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.householdId, total, txn_date || new Date().toISOString().slice(0, 10),
       note || null, req.user.id, category_id || null, from_account_id,
       merchant_name || null, line_items?.length ? 'exact' : 'manual', receipt_fingerprint || null]
    );
    const txn = txRows[0];
    const savedLineItems = [];
    if (Array.isArray(line_items)) {
      for (const item of line_items) {
        const { rows: liRows } = await client.query(
          `INSERT INTO transaction_line_items
            (transaction_id, raw_text, normalized_text, amount, category_id, categorization_source)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [txn.id, item.raw_text || item.normalized_text || '', item.normalized_text || item.raw_text || '',
           item.amount, item.category_id || null, item.categorization_source || 'manual']
        );
        savedLineItems.push(liRows[0]);
      }
    }
    await client.query('COMMIT');
    return res.status(201).json({ transaction: { ...txn, amount: Number(txn.amount) }, line_items: savedLineItems });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
