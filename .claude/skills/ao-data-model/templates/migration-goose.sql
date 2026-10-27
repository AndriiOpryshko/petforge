-- Staged as docs/features/<slug>/migrations/NNNNN_create_<table>.sql (order in MANIFEST.md).
-- Promoted with `mise run migrate:new create_<table>` -> services/core/migrations/0000N_create_<table>.sql.
-- Owner: <context> (only its sqlc queries touch this table). Origin: <PRD AC / SAD §5>.

-- +goose Up
CREATE TABLE <table> (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    association_id  uuid        NOT NULL,                     -- id of identity.associations, no FK (ADR 0002)
    <parent>_id     uuid        NOT NULL REFERENCES <parent> (id),  -- same context
    <name>          text        NOT NULL CHECK (char_length(<name>) BETWEEN 1 AND <N>),
    <state>         text        NOT NULL CHECK (<state> IN ('<s1>', '<s2>')),  -- closed set, PRD §10; no DEFAULT
    <amount>_minor  bigint      CHECK (<amount>_minor > 0),
    <happened_on>   date        NOT NULL,                     -- calendar date
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),       -- omit for append-only rows (and the trigger)
    CONSTRAINT <table>_association_id_<name>_key UNIQUE (association_id, <name>)  -- §5.1 <context>.<error_name>
);

-- FK index (leading column = FK).
CREATE INDEX <table>_<parent>_id_idx ON <table> (<parent>_id);
-- Serves <ListX>: WHERE association_id = $1 ORDER BY created_at DESC, id DESC.
CREATE INDEX <table>_association_id_created_at_idx ON <table> (association_id, created_at DESC, id DESC);

-- Pick ONE of the two blocks below.
-- (a) Mutable rows: keep updated_at and the shared trigger from 00001_init.sql.
CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table>
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- (b) Append-only rows guarded by an ADR (drop updated_at and block (a)). Cite the ADR:
-- ADR <n>: <decision> (docs/features/<slug>/adr/<file>.md)
-- +goose StatementBegin
CREATE FUNCTION <table>_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '<table> rows are immutable (ADR <n>)' USING ERRCODE = 'restrict_violation';
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER <table>_reject_change BEFORE UPDATE OR DELETE ON <table>
FOR EACH ROW EXECUTE FUNCTION <table>_reject_change();

-- +goose Down
-- Reverse order of Up. Dropping the table drops its indexes and triggers.
DROP TABLE <table>;
DROP FUNCTION <table>_reject_change();   -- only with block (b)
