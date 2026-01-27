/**
 * Normalize text for grouping.
 * 1. Trims whitespace.
 * 2. Collapses repeating characters (e.g., "สุดยอดดด" -> "สุดยอด").
 * 3. Maintains distinction between different words (e.g., "ชาเขียว" != "ชาไทย").
 */
export const normalizeForGrouping = (text: string): string => {
  if (!text) return "";
  
  // 1. Remove outer whitespace and lowercase (mostly for English, minimal impact on Thai)
  let clean = text.trim().toLowerCase();
  
  // 2. Collapse repeating characters (2 or more) into a single character
  // This handles "สุดยอดดด" -> "สุดยอด", "มากกกก" -> "มาก"
  // But keeps "ชาเขียว" distinct from "ชาไทย"
  clean = clean.replace(/(.)\1+/gu, '$1');
  
  // 3. Remove spaces inside the word to group "ไอ ที" and "ไอที" (Optional, usually good for word clouds)
  clean = clean.replace(/\s+/g, '');

  return clean;
};

/**
 * Determines which text should be displayed for the group.
 * Generally, we prefer the shortest version that was submitted (cleanest).
 */
export const getBestDisplayText = (current: string, newText: string): string => {
  if (!current) return newText;
  // Prefer the shorter one (e.g., "สุดยอด" over "สุดยอดดด")
  if (newText.length < current.length) return newText;
  return current;
};

/**
 * Generates a UUID v4 string.
 * This ensures compatibility with both 'text' and 'uuid' column types in Postgres.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
