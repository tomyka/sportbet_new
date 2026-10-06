/**
 * sportbet's emoji on the hub, by code point: no emoji is typed into a
 * source file (the plan's conventions).
 */
export const GLYPH = {
  /** "Vykstantys turnyrai": red circle. */
  active: String.fromCodePoint(0x1f534),
  /** "Artėjantys turnyrai": hourglass. */
  upcoming: String.fromCodePoint(0x23f3),
  /** "Pasibaigę turnyrai": file folder. */
  finished: String.fromCodePoint(0x1f4c1),
  /** Ranks 1, 2 and 3 in "Lyderiai": the medals. */
  gold: String.fromCodePoint(0x1f947),
  silver: String.fromCodePoint(0x1f948),
  bronze: String.fromCodePoint(0x1f949),
  /** "Kaip tai veikia?": direct hit, bar chart, trophy. */
  target: String.fromCodePoint(0x1f3af),
  chart: String.fromCodePoint(0x1f4ca),
  trophy: String.fromCodePoint(0x1f3c6),
  /** The charity card's heart. */
  heart: String.fromCodePoint(0x2665),
} as const;
