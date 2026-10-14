-- The key of the league member search (slice 12b), toward sportbet's
-- utf8mb4_unicode_ci, which compares names and usernames without regard to
-- case or accent: 'Šarūnas' is found by 'sarunas', 'SARU' and 'š'. The
-- letters that do not decompose (and have a capital) are first made
-- lowercase by hand, so the fold does not depend on the database's locale
-- for them; then email_fold (0006: NFKD, combining marks dropped, 'øłđıßæœþ'
-- expanded), then lower() on what is left. Applied to name, surname and
-- username only: never to an address (#41).
CREATE FUNCTION name_fold(name text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN lower(email_fold(
    replace(replace(replace(
      translate(name, 'ØŁĐ', 'øłđ'),
      'Æ', 'æ'), 'Œ', 'œ'), 'Þ', 'þ')
  ));
