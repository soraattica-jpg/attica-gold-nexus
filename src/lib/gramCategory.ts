export const getGramCategory = (value?: string | number | null) => {
  const normalized = String(value ?? "").replace(/,/g, ".").trim();
  if (!normalized) return "";

  const grams = normalized
    .match(/\d+(?:\.\d+)?/g)
    ?.map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item) && item > 0) || [];

  const estimatedGrams = grams.length > 0 ? Math.max(...grams) : 0;
  if (estimatedGrams < 1) return "";
  if (estimatedGrams >= 15) return "PLATINUM";
  if (estimatedGrams > 5) return "GOLD";
  return "SILVER";
};
