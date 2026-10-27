-- Phase 3 of 3 (contract). PR 3, after PR 2 is deployed and the backfill note's check returned 0.
-- Staged as NNNNN_contract_<table>_<column>.sql.
-- Makes <column> NOT NULL without a long ACCESS EXCLUSIVE scan:
--   NOT VALID CHECK (instant) -> VALIDATE (SHARE UPDATE EXCLUSIVE, writes continue)
--   -> SET NOT NULL (uses the validated CHECK, no scan) -> drop the helper CHECK.
-- For a rename/drop contract, replace the body with: ALTER TABLE <table> DROP COLUMN <old_column>;
-- and make the Down re-add it with its exact type, NOT NULL, default, CHECK, FK and index.
-- Each statement is short; goose's single transaction is fine here. For a very large table split
-- VALIDATE into its own NO TRANSACTION file.

-- +goose Up
ALTER TABLE <table> ADD CONSTRAINT <table>_<column>_not_null CHECK (<column> IS NOT NULL) NOT VALID;
ALTER TABLE <table> VALIDATE CONSTRAINT <table>_<column>_not_null;
ALTER TABLE <table> ALTER COLUMN <column> SET NOT NULL;
ALTER TABLE <table> DROP CONSTRAINT <table>_<column>_not_null;

-- Same-context FK on a large table, same pattern (optional):
-- ALTER TABLE <table> ADD CONSTRAINT <table>_<column>_fkey FOREIGN KEY (<column>) REFERENCES <parent> (id) NOT VALID;
-- ALTER TABLE <table> VALIDATE CONSTRAINT <table>_<column>_fkey;

-- +goose Down
-- ALTER TABLE <table> DROP CONSTRAINT <table>_<column>_fkey;
ALTER TABLE <table> ALTER COLUMN <column> DROP NOT NULL;
