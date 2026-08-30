/** Structured measurement field templates for ladies/gents */
export const LADIES_FIELDS = [
  "Bust", "Waist", "Hip", "Shoulder", "Sleeve", "Armhole", "Length", "Neck",
] as const;

export const GENTS_FIELDS = [
  "Chest", "Waist", "Shoulder", "Sleeve", "Shirt Length", "Pant Waist", "Hip", "Inseam",
] as const;

export function emptyLadiesMeasurements(): Record<string, string> {
  return Object.fromEntries(LADIES_FIELDS.map((f) => [f, ""]));
}

export function emptyGentsMeasurements(): Record<string, string> {
  return Object.fromEntries(GENTS_FIELDS.map((f) => [f, ""]));
}
