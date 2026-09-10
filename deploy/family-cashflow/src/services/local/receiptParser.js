// Pure receipt-text extraction shared by the API (api/src/routes/receipt.js)
// and the offline client pipeline (src/services/local/receipt.ts) so both
// parse the same OCR text identically.

export function normalizeLine(line) {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Extract a date from text (supports common Indonesian receipt formats)
export function extractDate(text) {
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
export function extractMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    const n = normalizeLine(line);
    if (n.length < 2) continue;
    if (/^(subtotal|total|grand total|bayar|tunai|kartu|kembalian|change|cash|card)/i.test(n)) continue;
    return line.trim();
  }
  return null;
}

// Extract total amount: look for "TOTAL", "GRAND TOTAL", "BAYAR", etc.
export function extractTotal(lines) {
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
export function extractLineItems(lines) {
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