export function normalizeModelName(value: string) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function findModelRatio(models: { model: string; ratio: number }[], model: string) {
  const normalized = normalizeModelName(model);
  const exact = models.find((item) => item.model === normalized);
  if (exact) {
    return exact.ratio;
  }

  const lower = normalized.toLowerCase();
  return models.find((item) => item.model.toLowerCase() === lower)?.ratio;
}
