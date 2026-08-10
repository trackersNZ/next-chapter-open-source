const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function localNoon(dateKey) {
  if (typeof dateKey !== "string" || !DATE_KEY.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00`);
  const [year, month, day] = dateKey.split("-").map(Number);
  return Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
}

function finitePositive(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeWaistUnit(unit) {
  return unit === "in" ? "in" : "cm";
}

export function waistInputRange(unit = "cm") {
  return normalizeWaistUnit(unit) === "in" ? { min: 11.8, max: 118.1 } : { min: 30, max: 300 };
}

export function waistInputWithinBounds(value, unit = "cm") {
  const number = typeof value === "number" ? value : Number(value);
  const { min, max } = waistInputRange(unit);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function convertWaistMeasurement(value, fromUnit = "cm", toUnit = "cm") {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  const from = normalizeWaistUnit(fromUnit);
  const to = normalizeWaistUnit(toUnit);
  if (from === to) return number;
  const converted = from === "in" ? number * 2.54 : number / 2.54;
  return Number.isFinite(converted) ? converted : null;
}

export function waistToCanonicalCentimetres(value, unit = "cm") {
  const centimetres = convertWaistMeasurement(value, unit, "cm");
  return centimetres === null ? null : Math.round((centimetres + Number.EPSILON) * 10) / 10;
}

export function escapeSvgAttribute(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

/** Return valid, date-deduplicated entries in calendar order (oldest first). */
export function normalizeWeightEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const byDate = new Map();
  entries.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || !localNoon(candidate.date)) return;
    const weight = finitePositive(candidate.weight);
    if (weight === null) return;
    const waist = candidate.waist === null || candidate.waist === "" || candidate.waist === undefined
      ? null
      : finitePositive(candidate.waist);
    if (candidate.waist !== null && candidate.waist !== "" && candidate.waist !== undefined && waist === null) return;
    const entry = {
      id: String(candidate.id || `weight-${candidate.date}-${index}`),
      date: candidate.date,
      weight,
      waist,
      note: String(candidate.note || "").trim(),
      createdAt: typeof candidate.createdAt === "string" && !Number.isNaN(new Date(candidate.createdAt).getTime())
        ? candidate.createdAt
        : new Date(0).toISOString(),
    };
    const current = byDate.get(entry.date);
    if (!current || entry.createdAt >= current.createdAt) byDate.set(entry.date, entry);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function rangeStart(anchor, range) {
  const start = new Date(anchor);
  if (range === "30d") start.setDate(start.getDate() - 29);
  else if (range === "3m" || range === "6m" || range === "1y") {
    const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - months);
    const daysInTargetMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, daysInTargetMonth));
  }
  else return null;
  return start;
}

/** Select entries relative to the latest recorded day; range is inclusive. */
export function filterWeightEntriesByRange(entries, range = "all") {
  const normalized = normalizeWeightEntries(entries);
  if (range === "all" || !normalized.length) return normalized;
  const start = rangeStart(localNoon(normalized.at(-1).date), range);
  return start ? normalized.filter((entry) => localNoon(entry.date) >= start) : normalized;
}

/** Summaries deliberately report measurements only, with no health interpretation. */
export function calculateWeightSummary(entries) {
  const normalized = normalizeWeightEntries(entries);
  const latest = normalized.at(-1) || null;
  if (!latest) return { latest: null, weightChange: null, latestWaist: null, waistChange: null, count: 0 };
  const first = normalized[0];
  const waistEntries = normalized.filter((entry) => entry.waist !== null);
  const latestWaist = [...waistEntries].at(-1) || null;
  return {
    latest,
    weightChange: normalized.length > 1 ? latest.weight - first.weight : null,
    latestWaist,
    waistChange: waistEntries.length > 1 ? latestWaist.waist - waistEntries[0].waist : null,
    count: normalized.length,
  };
}

function scaleDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.14, min * 0.008, 0.5);
  const lower = min > padding ? min - padding : 0;
  const upper = max > Number.MAX_VALUE - padding ? Number.MAX_VALUE : max + padding;
  return [lower, upper];
}

function pathFor(points) {
  return points.length ? points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ") : "";
}

/** Build predictable, SVG-ready geometry; empty input intentionally has no plotted paths. */
export function buildWeightChartGeometry(entries, options = {}) {
  const data = normalizeWeightEntries(entries);
  const width = Math.max(280, Number(options.width) || 760);
  const height = Math.max(220, Number(options.height) || 340);
  const margin = { top: 30, right: data.some((entry) => entry.waist !== null) ? 58 : 22, bottom: 48, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  if (!data.length) return { width, height, margin, plotWidth, plotHeight, entries: [], weightPoints: [], waistPoints: [], grid: [], xTicks: [], weightPath: "", waistPath: "", areaPath: "", weightDomain: null, waistDomain: null };

  const earliestTime = localNoon(data[0].date).getTime();
  const latestTime = localNoon(data.at(-1).date).getTime();
  const elapsedTime = latestTime - earliestTime;
  const x = (entry) => margin.left + (data.length === 1 ? plotWidth / 2 : ((localNoon(entry.date).getTime() - earliestTime) / elapsedTime) * plotWidth);
  const weightDomain = scaleDomain(data.map((entry) => entry.weight));
  const yFor = (value, domain) => margin.top + ((domain[1] - value) / (domain[1] - domain[0])) * plotHeight;
  const weightPoints = data.map((entry) => ({ ...entry, x: x(entry), y: yFor(entry.weight, weightDomain) }));
  const waistData = data.filter((entry) => entry.waist !== null);
  const waistDomain = waistData.length ? scaleDomain(waistData.map((entry) => entry.waist)) : null;
  const waistPoints = data.map((entry) => entry.waist === null ? null : ({ ...entry, x: x(entry), y: yFor(entry.waist, waistDomain) })).filter(Boolean);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return { y: margin.top + ratio * plotHeight, weight: weightDomain[1] - ratio * (weightDomain[1] - weightDomain[0]), waist: waistDomain ? waistDomain[1] - ratio * (waistDomain[1] - waistDomain[0]) : null };
  });
  const tickIndexes = [...new Set([0, Math.round((data.length - 1) / 2), data.length - 1])];
  const xTicks = tickIndexes.map((index) => ({ x: x(data[index]), date: data[index].date }));
  const weightPath = pathFor(weightPoints);
  const waistPath = pathFor(waistPoints);
  const baseline = margin.top + plotHeight;
  const areaPath = weightPoints.length ? `${weightPath} L${weightPoints.at(-1).x.toFixed(2)},${baseline.toFixed(2)} L${weightPoints[0].x.toFixed(2)},${baseline.toFixed(2)} Z` : "";
  return { width, height, margin, plotWidth, plotHeight, entries: data, weightPoints, waistPoints, grid, xTicks, weightPath, waistPath, areaPath, weightDomain, waistDomain };
}
