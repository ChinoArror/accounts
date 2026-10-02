-- Make every register code single-use and retain the request country for new claims.
-- Run once on an existing auth-center D1 database:
-- npx wrangler d1 execute auth-center-db --remote --file=./migrate-register-code-single-use-2026-07-30.sql

ALTER TABLE register_code_uses ADD COLUMN country_code TEXT;

DELETE FROM register_code_uses
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM register_code_uses
  GROUP BY code_id
);

UPDATE register_codes
SET max_uses = 1,
    used_count = CASE
      WHEN status = 'used'
        OR used_by_uuid IS NOT NULL
        OR COALESCE(used_count, 0) > 0
        OR EXISTS (
          SELECT 1
          FROM register_code_uses uses
          WHERE uses.code_id = COALESCE(register_codes.id, register_codes.code)
        )
      THEN 1
      ELSE 0
    END,
    status = CASE
      WHEN status = 'pause' THEN 'pause'
      WHEN status = 'used'
        OR used_by_uuid IS NOT NULL
        OR COALESCE(used_count, 0) > 0
        OR EXISTS (
          SELECT 1
          FROM register_code_uses uses
          WHERE uses.code_id = COALESCE(register_codes.id, register_codes.code)
        )
      THEN 'used'
      ELSE 'unused'
    END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_register_code_uses_one_per_code
ON register_code_uses(code_id);
