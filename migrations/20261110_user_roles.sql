BEGIN;

UPDATE users
SET role = CASE UPPER(COALESCE(role, 'USER'))
  WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'
  WHEN 'ADMIN' THEN 'ADMIN'
  WHEN 'USER' THEN 'USER'
  ELSE 'USER'
END;

UPDATE users
SET role = 'SUPER_ADMIN'
WHERE username = 'admin';

UPDATE users
SET enabled = TRUE
WHERE enabled IS NULL;

UPDATE users
SET enabled = TRUE
WHERE username = 'admin' AND role = 'SUPER_ADMIN';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE username = 'admin' AND role = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'The existing admin user was not found; no SUPER ADMIN was promoted';
  END IF;
END
$$;

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'USER';
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER'));
  END IF;
END
$$;

COMMIT;
