-- Custom SQL migration
-- Stock ledger immutability guard: once a stock_transactions row exists it is
-- part of the posted ledger. Business services write ledger rows only inside
-- committed transactions and never UPDATE/DELETE them. This trigger makes the
-- invariant enforceable at the database level as defense in depth.
CREATE OR REPLACE FUNCTION stock_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_transactions rows are immutable (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_transactions_no_update
  BEFORE UPDATE ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION stock_ledger_immutable();

CREATE TRIGGER stock_transactions_no_delete
  BEFORE DELETE ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION stock_ledger_immutable();
