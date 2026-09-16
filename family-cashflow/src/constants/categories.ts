export const DEFAULT_CATEGORIES = {
  income: [
    { name: 'Salary', icon: 'briefcase', color: '#10B981' },
    { name: 'Freelance', icon: 'laptop', color: '#34D399' },
    { name: 'Investment Return', icon: 'trending-up', color: '#6EE7B7' },
    { name: 'Gift', icon: 'gift', color: '#A7F3D0' },
    { name: 'Other Income', icon: 'plus-circle', color: '#D1FAE5' },
  ],
  expense: [
    { name: 'Food & Drinks', icon: 'utensils', color: '#EF4444' },
    { name: 'Transportation', icon: 'car', color: '#F87171' },
    { name: 'Shopping', icon: 'shopping-bag', color: '#FCA5A5' },
    { name: 'Bills & Utilities', icon: 'zap', color: '#DC2626' },
    { name: 'Entertainment', icon: 'film', color: '#B91C1C' },
    { name: 'Health', icon: 'heart', color: '#991B1B' },
    { name: 'Education', icon: 'book-open', color: '#7F1D1D' },
    { name: 'Groceries', icon: 'shopping-cart', color: '#450A0A' },
    { name: 'Rent', icon: 'home', color: '#881337' },
    { name: 'Other Expense', icon: 'minus-circle', color: '#FECDD3' },
  ],
};

export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer',
  'transfer_out',
  'transfer_in',
  'investment',
  'saving',
] as const;

export type TransactionType = typeof TRANSACTION_TYPES[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  transfer_out: 'Transfer Out',
  transfer_in: 'Transfer In',
  investment: 'Investment',
  saving: 'Saving',
};

export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  credit_card: 'Credit Card',
};
