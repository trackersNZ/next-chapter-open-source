import assert from "node:assert/strict";
import test from "node:test";
import { buildWeightChartGeometry, calculateWeightSummary, convertWaistMeasurement, escapeSvgAttribute, filterWeightEntriesByRange, normalizeWaistUnit, normalizeWeightEntries, waistInputRange, waistInputWithinBounds, waistToCanonicalCentimetres } from "../weight-tracker.js";

const entries = [
  { id: "a", date: "2026-01-01", weight: 80, waist: 90, note: "start", createdAt: "2026-01-01T01:00:00.000Z" },
  { id: "b", date: "2026-01-31", weight: 79.2, waist: null, note: "", createdAt: "2026-01-31T01:00:00.000Z" },
  { id: "c", date: "2026-03-01", weight: 78.4, waist: 88, note: "later", createdAt: "2026-03-01T01:00:00.000Z" },
];

test("waist units normalize and convert without changing canonical entry storage", () => {
  assert.equal(normalizeWaistUnit("in"), "in");
  assert.equal(normalizeWaistUnit("feet"), "cm");
  assert.equal(convertWaistMeasurement(100, "cm", "in"), 100 / 2.54);
  assert.equal(convertWaistMeasurement(40, "in", "cm"), 101.6);
  assert.equal(convertWaistMeasurement(-2.54, "cm", "in"), -1);
  assert.equal(convertWaistMeasurement("nope", "cm", "in"), null);
});

test("waist entry canonicalization rounds selected-unit values to one decimal centimetre", () => {
  assert.equal(waistToCanonicalCentimetres(11.8, "in"), 30);
  assert.equal(waistToCanonicalCentimetres(118.1, "in"), 300);
  assert.equal(waistToCanonicalCentimetres(32.5, "in"), 82.6);
  assert.equal(waistToCanonicalCentimetres(82.6, "cm"), 82.6);
});

test("waist input bounds validate the selected unit before canonicalization", () => {
  assert.deepEqual(waistInputRange("cm"), { min: 30, max: 300 });
  assert.deepEqual(waistInputRange("in"), { min: 11.8, max: 118.1 });
  assert.equal(waistInputWithinBounds(11.8, "in"), true);
  assert.equal(waistInputWithinBounds(118.1, "in"), true);
  assert.equal(waistInputWithinBounds(11.799, "in"), false);
  assert.equal(waistInputWithinBounds(118.11, "in"), false);
});

test("normalizes defensively, sorts dates, and keeps the newest duplicate", () => {
  const result = normalizeWeightEntries([
    { ...entries[1], id: "older", weight: 81, createdAt: "2025-12-01T01:00:00.000Z" },
    { date: "bad", weight: 70 },
    { date: "2026-02-29", weight: 70 },
    { ...entries[0], note: "  start  " },
    { ...entries[1] },
    { ...entries[2], waist: "88" },
    { date: "2026-03-02", weight: 0 },
    { date: ["2026-01-01"], weight: 70 },
    { date: { value: "2026-01-01" }, weight: 70 },
  ]);
  assert.deepEqual(result.map((entry) => entry.id), ["a", "b", "c"]);
  assert.equal(result[0].note, "start");
  assert.equal(result[2].waist, 88);
  assert.doesNotThrow(() => normalizeWeightEntries([{ date: ["2026-01-01"], weight: 70 }]));
  const hostileNote = 'note" onmouseover="alert(1)" <svg>';
  const escapedAttribute = escapeSvgAttribute(hostileNote);
  assert.match(escapedAttribute, /&quot;/);
  assert.equal(/["<>']/.test(escapedAttribute), false);
  assert.equal(escapedAttribute.includes('" onmouseover='), false);

});

test("filters ranges relative to the latest measurement with inclusive boundaries", () => {
  const rangeEntries = [
    { id: "old", date: "2025-03-01", weight: 90, waist: null, note: "", createdAt: "2025-03-01T00:00:00.000Z" },
    { id: "year", date: "2025-03-02", weight: 89, waist: null, note: "", createdAt: "2025-03-02T00:00:00.000Z" },
    { id: "three", date: "2025-12-02", weight: 85, waist: null, note: "", createdAt: "2025-12-02T00:00:00.000Z" },
    { id: "thirty", date: "2026-02-01", weight: 82, waist: null, note: "", createdAt: "2026-02-01T00:00:00.000Z" },
    { id: "latest", date: "2026-03-02", weight: 81, waist: null, note: "", createdAt: "2026-03-02T00:00:00.000Z" },
  ];
  assert.deepEqual(filterWeightEntriesByRange(rangeEntries, "30d").map((entry) => entry.id), ["thirty", "latest"]);
  assert.deepEqual(filterWeightEntriesByRange(rangeEntries, "3m").map((entry) => entry.id), ["three", "thirty", "latest"]);
  assert.deepEqual(filterWeightEntriesByRange(rangeEntries, "1y").map((entry) => entry.id), ["year", "three", "thirty", "latest"]);
  assert.deepEqual(filterWeightEntriesByRange(rangeEntries, "6m").map((entry) => entry.id), ["three", "thirty", "latest"]);
  assert.equal(filterWeightEntriesByRange(rangeEntries, "all").length, 5);
});

test("summaries are neutral measurement deltas and waist remains optional", () => {
  const summary = calculateWeightSummary(entries);
  assert.equal(summary.latest.weight, 78.4);
  assert.equal(summary.weightChange, -1.5999999999999943);
  assert.equal(summary.latestWaist.waist, 88);
  assert.equal(summary.waistChange, -2);
  assert.equal(calculateWeightSummary([]).latest, null);
  const oneEntry = calculateWeightSummary([entries[0]]);
  assert.equal(oneEntry.weightChange, null);
  assert.equal(oneEntry.waistChange, null);
  const oneWaist = calculateWeightSummary([entries[0], entries[1]]);
  assert.equal(oneWaist.weightChange, -0.7999999999999972);
  assert.equal(oneWaist.waistChange, null);

});

test("chart geometry is deterministic and never emits invalid coordinates", () => {
  const empty = buildWeightChartGeometry([]);
  assert.equal(empty.weightPath, "");
  assert.equal(empty.areaPath, "");
  const single = buildWeightChartGeometry([entries[0]]);
  assert.equal(single.weightPoints.length, 1);
  assert.match(single.weightPath, /^M/);
  const multi = buildWeightChartGeometry(entries, { width: 600, height: 300 });
  assert.equal(multi.weightPoints.length, 3);
  assert.equal(multi.waistPoints.length, 2);
  assert.ok(multi.areaPath.endsWith("Z"));
  assert.equal(/NaN|Infinity/.test(JSON.stringify(multi)), false);
  const unevenDates = buildWeightChartGeometry([
    { ...entries[0], date: "2026-01-01" },
    { ...entries[1], date: "2026-01-02" },
    { ...entries[2], date: "2026-01-11" },
  ], { width: 600, height: 300 });
  const firstGap = unevenDates.weightPoints[1].x - unevenDates.weightPoints[0].x;
  const secondGap = unevenDates.weightPoints[2].x - unevenDates.weightPoints[1].x;
  assert.ok(secondGap > firstGap * 8, "x gaps should follow elapsed calendar days");

  const extreme = buildWeightChartGeometry([
    { id: "max-a", date: "2026-01-01", weight: Number.MAX_VALUE / 2, waist: Number.MAX_VALUE / 2, note: "", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "max-b", date: "2026-01-02", weight: Number.MAX_VALUE, waist: Number.MAX_VALUE, note: "", createdAt: "2026-01-02T00:00:00.000Z" },
  ]);
  assert.equal(/NaN|Infinity/.test(JSON.stringify(extreme)), false);
  assert.ok(extreme.weightPoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(extreme.waistPoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.deepEqual(buildWeightChartGeometry(entries, { width: 600, height: 300 }), multi);
});
