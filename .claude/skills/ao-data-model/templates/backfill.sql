-- Phase 2 of 3 (backfill). PR 2, after PR 1 is deployed. Staged as NNNNN_backfill_<table>_<column>.sql.
-- Fills <column> for rows written before the dual write. Resumable: touches only rows where it is still NULL.
-- Runbook, ETA and verification: backfill-<table>-<column>.md next to this file.
-- NO TRANSACTION so the DO block can COMMIT between batches (Postgres 11+); locks stay short.
-- If goose's driver reports "invalid transaction termination", the COMMIT is not allowed in this
-- session: remove it and run the loop as one transaction (check it in the schema roundtrip first).
-- For a small table (< ~10k rows) drop the NO TRANSACTION line and the COMMIT: one transaction is fine.

-- +goose NO TRANSACTION

-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    batch_size constant int := 5000;
    updated int;
BEGIN
    LOOP
        UPDATE <table> t
        SET <column> = <expression>                       -- e.g. (SELECT id FROM ... LIMIT 1), or a derived value
        WHERE t.id IN (
            SELECT id FROM <table>
            WHERE <column> IS NULL
            ORDER BY id
            LIMIT batch_size
            FOR UPDATE SKIP LOCKED
        );
        GET DIAGNOSTICS updated = ROW_COUNT;
        EXIT WHEN updated = 0;
        COMMIT;
    END LOOP;
END
$$;
-- +goose StatementEnd

-- +goose Down
-- Intentionally a no-op: the expand Down drops the column, which removes the backfilled values.
-- Do not NULL the column here - the dual write keeps filling it and a rollback of this phase alone
-- must not erase values the running app relies on.
SELECT 1;
