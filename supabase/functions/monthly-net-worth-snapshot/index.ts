// Supabase Edge Function: monthly-net-worth-snapshot
// Deploy with: supabase functions deploy monthly-net-worth-snapshot
// Schedule via Supabase Dashboard -> Database -> Cron Jobs, or pg_cron
// calling this function's URL on the 1st of every month.
//
// Requires SUPABASE_SERVICE_ROLE_KEY as an env var (set in Supabase
// dashboard function secrets) — service role bypasses RLS, which is
// required since this writes to a client-read-only table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (_req) => {
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-09"

  const { data: households, error: hErr } = await supabase
    .from("households")
    .select("id");

  if (hErr) {
    return new Response(JSON.stringify({ error: hErr.message }), { status: 500 });
  }

  const results = [];

  for (const household of households ?? []) {
    const householdId = household.id;

    const [{ data: accounts }, { data: investments }, { data: assets }, { data: liabilities }] =
      await Promise.all([
        supabase.from("accounts").select("balance").eq("household_id", householdId),
        supabase.from("investments").select("current_value").eq("household_id", householdId),
        supabase.from("assets").select("current_value").eq("household_id", householdId),
        supabase.from("liabilities").select("current_balance").eq("household_id", householdId),
      ]);

    const sum = (rows: any[] | null, field: string) =>
      (rows ?? []).reduce((acc, r) => acc + Number(r[field] ?? 0), 0);

    const accountsTotal = sum(accounts, "balance");
    const investmentsTotal = sum(investments, "current_value");
    const assetsTotal = sum(assets, "current_value");
    const liabilitiesTotal = sum(liabilities, "current_balance");

    const totalAssets = accountsTotal + investmentsTotal + assetsTotal;
    const netWorth = totalAssets - liabilitiesTotal;

    const { error: upsertErr } = await supabase
      .from("net_worth_snapshots")
      .upsert(
        {
          household_id: householdId,
          month: monthKey,
          total_assets: totalAssets,
          total_liabilities: liabilitiesTotal,
          net_worth: netWorth,
          breakdown: {
            accounts: accountsTotal,
            investments: investmentsTotal,
            assets: assetsTotal,
            liabilities: liabilitiesTotal,
          },
        },
        { onConflict: "household_id,month" }
      );

    results.push({ householdId, netWorth, error: upsertErr?.message ?? null });
  }

  return new Response(JSON.stringify({ month: monthKey, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
