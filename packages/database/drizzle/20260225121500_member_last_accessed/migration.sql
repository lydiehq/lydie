ALTER TABLE "members"
ADD COLUMN IF NOT EXISTS "last_accessed_at" timestamp DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "members_user_last_accessed_idx"
ON "members" ("user_id", "last_accessed_at");

CREATE OR REPLACE FUNCTION update_member_last_accessed_from_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.active_organization_id IS NOT DISTINCT FROM OLD.active_organization_id THEN
    RETURN NEW;
  END IF;

  IF NEW.active_organization_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    UPDATE "members"
    SET
      "last_accessed_at" = now(),
      "updated_at" = now()
    WHERE
      "user_id" = NEW.user_id
      AND "organization_id" = NEW.active_organization_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_update_member_last_accessed ON "sessions";

CREATE TRIGGER sessions_update_member_last_accessed
AFTER INSERT OR UPDATE OF active_organization_id ON "sessions"
FOR EACH ROW
EXECUTE FUNCTION update_member_last_accessed_from_session();
