import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import householdRoutes from './routes/household.js';
import accountRoutes from './routes/accounts.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import dictionaryRoutes from './routes/dictionary.js';
import categorizeRoutes from './routes/categorize.js';
import receiptRoutes from './routes/receipt.js';
import budgetRoutes from './routes/budgets.js';
import savingGoalRoutes from './routes/saving-goals.js';
import investmentRoutes from './routes/investments.js';
import assetRoutes from './routes/assets.js';
import liabilityRoutes from './routes/liabilities.js';
import netWorthRoutes from './routes/net-worth.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(cors());
// 30mb so receipt photos (base64) can reach /api/receipt/ocr.
app.use(express.json({ limit: '30mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/household', householdRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dictionary', dictionaryRoutes);
app.use('/api/categorize', categorizeRoutes);
app.use('/api/receipt', receiptRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/saving-goals', savingGoalRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/liabilities', liabilityRoutes);
app.use('/api/net-worth', netWorthRoutes);
app.use('/api/reports', reportRoutes);

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Family Finance API listening on http://localhost:${PORT}`);
  });
}
