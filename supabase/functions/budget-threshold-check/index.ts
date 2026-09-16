// Supabase Edge Function: budget-threshold-check
// Deploy with: supabase functions deploy budget-threshold-check
// Trigger via a Postgres Database Webhook (Supabase Dashboard ->
// Database -> Webhooks) firing on INSERT to `transactions` where
// type = 'expense' -> calls this function's URL with the new row.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS to read budgets/
// members across the household) and an FCM server key/project setup
// if using Firebase Cloud Messaging for push notifications; swap the
// sendPushNotification() body for your chosen push provider.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    household_id: string;
    type: string;
    category_id: string | null;
    amount: number;
    txn_date: string;
  };
}

Deno.serve(async (req) => {
  const payload: WebhookPayload = await req.json();
  const txn = payload.record;

  if (txn.type !== "expense" || !txn.category_id) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const monthKey = txn.txn_date.slice(0, 7); // "YYYY-MM"

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("household_id", txn.household_id)
    .eq("category_id", txn.category_id)
    .or(`month.eq.${monthKey},month.is.null`)
    .limit(1);

  const budget = budgets?.[0];
  if (!budget) {
    return new Response(JSON.stringify({ skipped: "no budget set" }), { status: 200 });
  }

  const start = `${monthKey}-01`;
  const endDate = new Date(start);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const { data: monthTxns } = await supabase
    .from("transactions")
    .select("amount")
    .eq("household_id", txn.household_id)
    .eq("category_id", txn.category_id)
    .eq("type", "expense")
    .gte("txn_date", start)
    .lt("txn_date", end);

  const spent = (monthTxns ?? []).reduce((acc, t) => acc + Number(t.amount), 0);
  const pct = spent / Number(budget.monthly_limit);
  const prevSpent = spent - Number(txn.amount);
  const prevPct = prevSpent / Number(budget.monthly_limit);

  let message: string | null = null;
  if (prevPct < 1 && pct >= 1) {
    message = "You've gone over your budget for this category this month.";
  } else if (prevPct < 0.8 && pct >= 0.8) {
    message = "You've used 80% of this category's budget this month.";
  }

  if (!message) {
    return new Response(JSON.stringify({ skipped: "no threshold crossed" }), { status: 200 });
  }

  const { data: members } = await supabase
    .from("household_members")
    .select("fcm_token")
    .eq("household_id", txn.household_id)
    .not("fcm_token", "is", null);

  const tokens = (members ?? []).map((m) => m.fcm_token).filter(Boolean);
  await sendPushNotification(tokens, "Budget Alert", message);

  return new Response(JSON.stringify({ sent: true, message, recipientCount: tokens.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function sendPushNotification(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return;
  // Replace with your push provider of choice (FCM HTTP v1 API, OneSignal, etc.)
  // This is a placeholder showing where that call goes.
  console.log(`Would send push to ${tokens.length} device(s): ${title} - ${body}`);
}
