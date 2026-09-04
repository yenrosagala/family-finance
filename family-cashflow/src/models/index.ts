export interface Household {
  id: string;
  name: string;
  invite_code: string;
  currency: string;
  created_by: string | null;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  display_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  joined_at: string;
  fcm_token: string | null;
}

export interface Account {
  id: string;
  household_id: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'credit_card';
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  transaction_type: 'income' | 'expense';
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  household_id: string;
  type: 'income' | 'expense' | 'transfer' | 'transfer_out' | 'transfer_in' | 'investment' | 'saving';
  amount: number;
  txn_date: string;
  note: string | null;
  added_by: string | null;
  created_at: string;
  category_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  to_person: string | null;
  investment_id: string | null;
  saving_goal_id: string | null;
  merchant_name: string | null;
  receipt_image_url: string | null;
  categorization_source: 'exact' | 'fuzzy' | 'fallback' | 'manual' | null;
  receipt_fingerprint: string | null;
}

export interface TransactionLineItem {
  id: string;
  transaction_id: string;
  raw_text: string;
  normalized_text: string | null;
  amount: number;
  category_id: string | null;
  categorization_source: 'exact' | 'fuzzy' | 'fallback' | 'manual' | null;
}

export interface ItemDictionary {
  id: string;
  household_id: string;
  keyword: string;
  normalized_keyword: string | null;
  category_id: string | null;
  source: 'default' | 'learned' | 'manual';
  confidence: number;
  times_confirmed: number;
  times_corrected: number;
  last_used: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  household_id: string;
  category_id: string | null;
  monthly_limit: number;
  month: string | null;
  is_recurring: boolean;
  rollover: boolean;
  created_by: string | null;
  created_at: string;
}

export interface SavingGoal {
  id: string;
  household_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  linked_account_id: string | null;
  created_at: string;
}

export interface Investment {
  id: string;
  household_id: string;
  name: string;
  type: 'stocks' | 'mutual_fund' | 'gold' | 'crypto' | 'property' | 'other';
  total_invested: number;
  current_value: number;
  last_updated: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  household_id: string;
  name: string;
  type: 'property' | 'vehicle' | 'other';
  current_value: number;
  last_updated: string | null;
}

export interface Liability {
  id: string;
  household_id: string;
  name: string;
  type: 'mortgage' | 'loan' | 'credit_card' | 'other';
  current_balance: number;
  original_amount: number | null;
  interest_rate: number | null;
  last_updated: string | null;
}

export interface NetWorthSnapshot {
  id: string;
  household_id: string;
  month: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: {
    accounts: number;
    investments: number;
    assets: number;
    liabilities: number;
  } | null;
  created_at: string;
}

export interface ParsedLineItem {
  raw_text: string;
  normalized_text: string | null;
  amount: number;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  categorization_source: 'exact' | 'fuzzy' | 'fallback' | 'manual' | null;
  confidence: number;
}

export interface ReceiptReconciliation {
  line_items_count: number;
  line_items_sum: number;
  printed_total: number | null;
  is_reconciled: boolean | null;
  discrepancy: number | null;
}

export interface ParsedReceipt {
  merchant: string | null;
  txn_date: string;
  total: number | null;
  line_items: ParsedLineItem[];
  receipt_fingerprint: string | null;
  reconciliation: ReceiptReconciliation;
  duplicate_check: {
    is_duplicate: boolean;
    existing_transaction_id: string | null;
  };
}
