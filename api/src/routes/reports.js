import { Router } from 'express';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = Router();

async function monthSummary(client, householdId, month) {
  const { rows } = await client.query(
    `select
       coalesce(sum(amount) filter (where type='income'), 0)::float as income,
       coalesce(sum(amount) filter (where type='expense'), 0)::float as expense,
       coalesce(sum(amount) filter (where type='saving'), 0)::float as saved,
       coalesce(sum(amount) filter (where type='investment'), 0)::float as invested
     from transactions
     where household_id = $1 and to_char(txn_date, 'YYYY-MM') = $2`,
    [householdId, month]
  );
  const r = rows[0];
  const income = Number(r.income || 0);
  const expense = Number(r.expense || 0);
  return { month, income, expense, saved: Number(r.saved || 0), invested: Number(r.invested || 0), net_cashflow: income - expense };
}

// GET /api/reports/pl?year=2026&month=9
router.get('/pl', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    const [incomeRows, expenseRows] = await Promise.all([
      client.query(
        `select c.name, c.color, c.icon, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'income' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name, c.color, c.icon order by amount desc`,
        [req.householdId, monthKey]
      ),
      client.query(
        `select c.name, c.color, c.icon, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'expense' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name, c.color, c.icon order by amount desc`,
        [req.householdId, monthKey]
      ),
    ]);

    const summary = await monthSummary(client, req.householdId, monthKey);
    return res.json({
      month: monthKey,
      income: { items: incomeRows.rows, total: summary.income },
      expense: { items: expenseRows.rows, total: summary.expense },
      net_cashflow: summary.net_cashflow,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/reports/balance-sheet
router.get('/balance-sheet', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const [accounts, investments, assets, liabilities] = await Promise.all([
      client.query(`select id, name, balance::float as balance from accounts where household_id = $1 order by name`, [req.householdId]),
      client.query(`select id, name, current_value::float as value from investments where household_id = $1 order by name`, [req.householdId]),
      client.query(`select id, name, type, current_value::float as value from assets where household_id = $1 order by name`, [req.householdId]),
      client.query(`select id, name, type, current_balance::float as balance from liabilities where household_id = $1 order by name`, [req.householdId]),
    ]);
    const accountsTotal = accounts.rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    const invTotal = investments.rows.reduce((s, r) => s + Number(r.value || 0), 0);
    const assetsTotal = accountsTotal + invTotal + assets.rows.reduce((s, r) => s + Number(r.value || 0), 0);
    const liabTotal = liabilities.rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    return res.json({
      accounts: accounts.rows, investments: investments.rows,
      assets: assets.rows, liabilities: liabilities.rows,
      totals: {
        accounts: accountsTotal, investments: invTotal,
        real_assets: assets.rows.reduce((s, r) => s + Number(r.value || 0), 0),
        assets: assetsTotal, liabilities: liabTotal, net_worth: assetsTotal - liabTotal,
      },
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/reports/compare?year=2026&month=9
router.get('/compare', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const d = new Date(year, month - 1, 1);
    const current = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevD = new Date(year, month - 2, 1);
    const previous = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    const [cur, prev] = await Promise.all([
      monthSummary(client, req.householdId, current),
      monthSummary(client, req.householdId, previous),
    ]);
    const fields = ['income', 'expense', 'net_cashflow', 'saved', 'invested'];
    const deltas = {};
    for (const f of fields) deltas[f] = Number((cur[f] - prev[f]).toFixed(2));
    return res.json({ current, previous, current_values: cur, previous_values: prev, deltas });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

function fmtAmount(n, currency) {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency || 'IDR'} ${Number(n || 0).toLocaleString('en-US')}`;
  }
}

// GET /api/reports/export?year=2026&month=9&format=xlsx|pdf
// Downloads the monthly financial statement (income statement + category detail).
router.get('/export', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (format !== 'xlsx' && format !== 'pdf') {
      return res.status(400).json({ error: 'format must be xlsx or pdf' });
    }

    const [summary, incomeRows, expenseRows, houseRows] = await Promise.all([
      monthSummary(client, req.householdId, monthKey),
      client.query(
        `select c.name, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'income' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name order by amount desc`,
        [req.householdId, monthKey]
      ),
      client.query(
        `select c.name, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'expense' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name order by amount desc`,
        [req.householdId, monthKey]
      ),
      client.query(`select name, currency from households where id = $1 limit 1`, [req.householdId]),
    ]);

    const householdName = houseRows.rows[0]?.name || 'Family Finance';
    const currency = houseRows.rows[0]?.currency || 'IDR';
    const incomeItems = incomeRows.rows.map((r) => ({ category: r.name, amount: Number(r.amount || 0) }));
    const expenseItems = expenseRows.rows.map((r) => ({ category: r.name, amount: Number(r.amount || 0) }));
    const filename = `financial-statement-${monthKey}.${format}`;

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [`${householdName} — Monthly Financial Statement`],
          ['Period', monthKey],
          [],
          ['Income', Number(summary.income || 0)],
          ['Expense', Number(summary.expense || 0)],
          ['Savings', Number(summary.saved || 0)],
          ['Investments', Number(summary.invested || 0)],
          ['Net Cashflow', Number(summary.net_cashflow || 0)],
        ]),
        'Summary'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          [{ Category: 'Category', Amount: 'Amount' }].concat(
            incomeItems.map((i) => ({ Category: i.category, Amount: i.amount }))
          ),
          { header: ['Category', 'Amount'] }
        ),
        'Income'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          [{ Category: 'Category', Amount: 'Amount' }].concat(
            expenseItems.map((i) => ({ Category: i.category, Amount: i.amount }))
          ),
          { header: ['Category', 'Amount'] }
        ),
        'Expense'
      );
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.concat(chunks));
    });
    doc.fontSize(18).text(householdName, { align: 'center' });
    doc.fontSize(12).text(`Monthly Financial Statement — ${monthKey}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text('Summary');
    doc.moveDown(0.5);
    for (const [label, value] of [
      ['Income', summary.income],
      ['Expense', summary.expense],
      ['Savings', summary.saved],
      ['Investments', summary.invested],
      ['Net Cashflow', summary.net_cashflow],
    ]) {
      doc.text(label);
      doc.text(fmtAmount(value, currency), { align: 'right' });
      doc.moveDown(0.5);
    }
    for (const [label, items] of [
      ['Income by Category', incomeItems],
      ['Expense by Category', expenseItems],
    ]) {
      doc.moveDown();
      doc.fontSize(11).text(label);
      doc.moveDown(0.5);
      for (const item of items) {
        doc.text(item.category);
        doc.text(fmtAmount(item.amount, currency), { align: 'right' });
        doc.moveDown(0.5);
      }
      if (items.length === 0) doc.fontSize(10).fillColor('#666666').text('No transactions');
      doc.fillColor('black');
    }
    doc.end();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
