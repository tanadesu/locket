export const RANKING_KEY = "power-charge.top10.v1";
export function playerName(value) {
  const clean = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  const parts =
    typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(
            clean,
          ),
        ].map((x) => x.segment)
      : Array.from(clean);
  return parts.slice(0, 8).join("") || "PLAYER";
}
export function readRanking(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(RANKING_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r) =>
          r &&
          typeof r.name === "string" &&
          Number.isInteger(r.power) &&
          r.power >= 0 &&
          r.power <= 9999 &&
          typeof r.id === "string",
      )
      .map((r) => ({
        id: r.id,
        name: playerName(r.name),
        power: r.power,
        date: Number.isFinite(r.date) ? r.date : 0,
      }))
      .sort((a, b) => b.power - a.power || a.date - b.date)
      .slice(0, 10);
  } catch {
    return [];
  }
}
export function saveScore(storage, entry) {
  const rows = readRanking(storage);
  if (rows.some((r) => r.id === entry.id))
    return { rows, saved: true, duplicate: true };
  if (!Number.isFinite(entry.power) || entry.power < 0 || entry.power > 9999)
    throw Error("INVALID_POWER");
  const row = {
    id: String(entry.id),
    name: playerName(entry.name),
    power: Math.floor(entry.power),
    date: entry.date ?? Date.now(),
  };
  const next = [...rows, row]
    .sort((a, b) => b.power - a.power || a.date - b.date)
    .slice(0, 10);
  try {
    storage.setItem(RANKING_KEY, JSON.stringify(next));
    return {
      rows: next,
      saved: true,
      rank: next.findIndex((r) => r.id === row.id) + 1,
    };
  } catch {
    return {
      rows: next,
      saved: false,
      rank: next.findIndex((r) => r.id === row.id) + 1,
    };
  }
}
