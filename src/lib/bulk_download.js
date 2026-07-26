/** Bulk mode only when the user kept ≥2 selected URLs for configure/download. */
export function shouldTreatAsBulk(bulkSelection) {
  return Array.isArray(bulkSelection) && bulkSelection.length > 1;
}
