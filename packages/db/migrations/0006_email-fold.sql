-- The key of players' unique address index (0007_accounts), toward
-- sportbet's utf8mb4_unicode_ci: the stored, normalized address in NFKD
-- (a full-width letter becomes the letter), every combining mark (U+0300
-- to U+036F) dropped, then the letters that do not decompose replaced by
-- their base letters or expansions, so 'žukauskas@' and 'zukauskas@',
-- 'straße@' and 'strasse@', 'łukasz@' and 'lukasz@' fold alike, as
-- sportbet's index refuses them. Never a lookup key (#41). The domain's
-- foldEmail is the same function, with the same table and the same known
-- gaps (its comment), on every BMP character but those Node's Unicode
-- knows and this server's does not yet (test/email-fold.test.ts).
CREATE FUNCTION email_fold(email text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN replace(replace(replace(replace(
    translate(
      regexp_replace(normalize(email, NFKD), '[\u0300-\u036f]', '', 'g'),
      'øłđı',
      'oldi'
    ),
    'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th');
