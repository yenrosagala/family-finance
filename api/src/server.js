import express from 'express';
import cors from 'cors';

import authRoutes      from './routes/auth.js';
import householdRoutes from './routes/household.js';
import accountRoutes   from './routes/accounts.js';
import categoryRoutes  from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import dictionaryRoutes  from './routes/dictionary.js';
import categorizeRoutes  from './routes/categorize.js';
import receiptRoutes     from './routes/receipt.js';
import budgetRoutes      from './routes/budgets.js';
import savingGoalRoutes  from './routes/saving-goals.js';
import investmentRoutes  from './routes/investments.js';
import assetRoutes       from './routes/assets.js';
import liabilityRoutes   from './routes/liabilities.js';
import netWorthRoutes    from './routes/net-worth.js';
import reportRoutes      from './routes/reports.js';

import { tenantMiddleware } from './middleware/tenant.js';

const app = express();
app.use(cors());
// 30mb so receipt photos (base64) can reach /api/receipt/ocr.
app.use(express.json({ limit: '30mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Auth routes — no tenant middleware ──────────────────────────────────────
// register, join, login don't need a household DB yet.
app.use('/api/auth', authRoutes);

// ─── Household routes — tenant middleware applied ────────────────────────────
// tenantMiddleware verifies JWT + resolves req.householdDb + req.householdId.
// All routes below receive these on req automatically.
app.use('/api/household',    tenantMiddleware, householdRoutes);
app.use('/api/accounts',     tenantMiddleware, accountRoutes);
app.use('/api/categories',   tenantMiddleware, categoryRoutes);
app.use('/api/transactions', tenantMiddleware, transactionRoutes);
app.use('/api/dictionary',   tenantMiddleware, dictionaryRoutes);
app.use('/api/categorize',   tenantMiddleware, categorizeRoutes);
app.use('/api/receipt',      tenantMiddleware, receiptRoutes);
app.use('/api/budgets',      tenantMiddleware, budgetRoutes);
app.use('/api/saving-goals', tenantMiddleware, savingGoalRoutes);
app.use('/api/investments',  tenantMiddleware, investmentRoutes);
app.use('/api/assets',       tenantMiddleware, assetRoutes);
app.use('/api/liabilities',  tenantMiddleware, liabilityRoutes);
app.use('/api/net-worth',    tenantMiddleware, netWorthRoutes);
app.use('/api/reports',      tenantMiddleware, reportRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Family Finance API listening on http://localhost:${PORT}`);
});
