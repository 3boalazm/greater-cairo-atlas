-- Migration 005: Checksummed automatic production seed + feature imports.
-- The checksum row is committed in the same transaction as its imported dataset.

CREATE TABLE import_runs (
  dataset_key TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_runs_dataset_key_nonempty_chk CHECK (btrim(dataset_key) <> ''),
  CONSTRAINT import_runs_checksum_sha256_chk CHECK (checksum ~ '^[a-f0-9]{64}$')
);
