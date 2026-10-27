-- Phase 1 of 3 (expand). PR 1. Staged as NNNNN_add_<table>_<column>.sql.
-- Adds <column> as NULLABLE. Instant on Postgres 18 (no default, no table rewrite).
-- App code in this PR: dual write - every INSERT/UPDATE of <table> sets <column>; reads still use <old_source>.
-- Origin: PRD §9 <bullet> / <AC>.

-- +goose Up
ALTER TABLE <table> ADD COLUMN <column> <type>;

-- +goose Down
ALTER TABLE <table> DROP COLUMN <column>;

-- If <column> needs an index, it goes in its OWN file from index-concurrently.sql
-- (NNNNN_index_<table>_<column>.sql): CONCURRENTLY cannot run inside goose's transaction.
-- Never paste goose annotations into a comment: goose parses them even after a second "--".
