-- An Equipment Unit's portions must add up to its Quantity. Checked at commit (deferred), because
-- the app replaces a unit's portions by deleting them all and then inserting the new set.
CREATE FUNCTION "equipment_total_matches_quantity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  unit_id text;
  expected integer;
  actual integer;
BEGIN
  IF TG_TABLE_NAME = 'equipment_unit' THEN
    unit_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    unit_id := OLD."equipment_unit_id";
  ELSE
    unit_id := NEW."equipment_unit_id";
  END IF;

  SELECT "quantity" INTO expected FROM "equipment_unit" WHERE "id" = unit_id;
  -- Removed in the same transaction (only test clean-up does this; the app never deletes one).
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum("count"), 0) INTO actual FROM "equipment_portion" WHERE "equipment_unit_id" = unit_id;

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Equipment Unit % has % across its portions but a Quantity of %', unit_id, actual, expected
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- An Equipment Unit with nothing anywhere and no Movement Log has never moved, so it's at its Home.
-- (Before 16 Oct 2026, deleting a unit removed its log and portions and then failed on the unit row
-- if a Duty referenced it, leaving exactly this.) Anything else that's wrong is refused below.
INSERT INTO "equipment_portion" ("id", "equipment_unit_id", "count", "whereabouts_type", "store_id")
SELECT gen_random_uuid()::text, u."id", u."quantity", 'store', u."home_id"
FROM "equipment_unit" u
WHERE NOT EXISTS (SELECT 1 FROM "equipment_portion" p WHERE p."equipment_unit_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "movement_log_entry" m WHERE m."equipment_unit_id" = u."id");
--> statement-breakpoint
-- A constraint trigger only checks rows changed from now on, so refuse to migrate over data that's already wrong.
DO $$
DECLARE
  bad record;
BEGIN
  SELECT u."id", u."quantity", coalesce(sum(p."count"), 0) AS total INTO bad
  FROM "equipment_unit" u LEFT JOIN "equipment_portion" p ON p."equipment_unit_id" = u."id"
  GROUP BY u."id", u."quantity"
  HAVING coalesce(sum(p."count"), 0) <> u."quantity"
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Equipment Unit % has % across its portions but a Quantity of %; fix it before migrating', bad."id", bad.total, bad."quantity";
  END IF;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "equipment_portion_total_matches_quantity"
  AFTER INSERT OR UPDATE OR DELETE ON "equipment_portion"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "equipment_total_matches_quantity"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "equipment_unit_total_matches_quantity"
  AFTER INSERT OR UPDATE OF "quantity" ON "equipment_unit"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "equipment_total_matches_quantity"();
