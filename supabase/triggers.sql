-- =========================================================
-- BALANCE SYNC TRIGGER
-- Keeps accounts.balance correct on every transaction
-- insert / update / delete, for all 7 transaction types.
-- =========================================================

create or replace function apply_balance_delta(
  p_type text,
  p_amount numeric,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_sign int   -- +1 to apply, -1 to reverse
) returns void as $$
declare
  delta numeric := p_amount * p_sign;
begin
  case p_type
    when 'income' then
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;

    when 'expense' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;

    when 'transfer' then -- internal: both accounts belong to the household
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;

    when 'transfer_out' then -- money leaves to an external person
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;

    when 'transfer_in' then -- money arrives from an external person
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;

    when 'investment' then -- money leaves a spending account into an investment
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;

    when 'saving' then -- money moves into a saving goal's linked account
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;

    else
      raise exception 'Unknown transaction type: %', p_type;
  end case;
end;
$$ language plpgsql;

create or replace function sync_account_balance()
returns trigger as $$
begin
  -- Reverse the OLD row's effect (on UPDATE or DELETE)
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    perform apply_balance_delta(
      old.type, old.amount, old.from_account_id, old.to_account_id, -1
    );
  end if;

  -- Apply the NEW row's effect (on INSERT or UPDATE)
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    perform apply_balance_delta(
      new.type, new.amount, new.from_account_id, new.to_account_id, 1
    );
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_sync_account_balance on transactions;
create trigger trg_sync_account_balance
  after insert or update or delete on transactions
  for each row execute function sync_account_balance();

-- =========================================================
-- SAVING GOAL / INVESTMENT ROLLUP TRIGGER
-- Keeps saving_goals.current_amount and investments.total_invested
-- in sync with their linked transactions (same before/after pattern).
-- =========================================================

create or replace function sync_goal_and_investment_totals()
returns trigger as $$
begin
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    if old.type = 'saving' and old.saving_goal_id is not null then
      update saving_goals set current_amount = current_amount - old.amount
        where id = old.saving_goal_id;
    end if;
    if old.type = 'investment' and old.investment_id is not null then
      update investments set total_invested = total_invested - old.amount
        where id = old.investment_id;
    end if;
  end if;

  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    if new.type = 'saving' and new.saving_goal_id is not null then
      update saving_goals set current_amount = current_amount + new.amount
        where id = new.saving_goal_id;
    end if;
    if new.type = 'investment' and new.investment_id is not null then
      update investments set total_invested = total_invested + new.amount
        where id = new.investment_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_sync_goal_and_investment_totals on transactions;
create trigger trg_sync_goal_and_investment_totals
  after insert or update or delete on transactions
  for each row execute function sync_goal_and_investment_totals();
