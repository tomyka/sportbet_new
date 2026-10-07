-- R-26 (amended, 2026-10-07): sportbet's admin levels as roles - 0 a
-- player, 1 to 7 a results manager, 8 and up a superadmin
-- (roleOfSportbetLevel in packages/domain/src/account/role.ts).
UPDATE "player_settings" SET "role" = CASE
  WHEN "admin_level" >= 8 THEN 'superadmin'::"player_role"
  WHEN "admin_level" >= 1 THEN 'results-manager'::"player_role"
  ELSE 'player'::"player_role"
END;
