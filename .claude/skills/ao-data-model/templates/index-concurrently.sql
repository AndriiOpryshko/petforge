-- Staged as NNNNN_index_<table>_<column>.sql. One statement per direction, nothing else.
-- Serves <QueryName>: WHERE <column> = $1 (data-model.md, Query -> index map).
-- A failed CONCURRENTLY build leaves an INVALID index; Down removes it, then re-run Up.

-- +goose NO TRANSACTION

-- +goose Up
CREATE INDEX CONCURRENTLY <table>_<column>_idx ON <table> (<column>);

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS <table>_<column>_idx;
