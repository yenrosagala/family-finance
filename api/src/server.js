import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import householdRoutes from './routes/household.js';
import accountRoutes from './routes/accounts.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/household', householdRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Family Finance API listening on http://localhost:${PORT}`);
});
