export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" }, { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" }, { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" }, { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export function parseLocalDate(value) {
  if (typeof value !== "string") return null;
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatLocalDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function inclusiveCourseEndDate(startDate, duration, unit = "days") {
  const start = parseLocalDate(startDate);
  const count = Number(duration);
  if (!start || !Number.isInteger(count) || count <= 0 || !["days", "weeks"].includes(unit)) return "";
  start.setDate(start.getDate() + count * (unit === "weeks" ? 7 : 1) - 1);
  return formatLocalDate(start);
}

export function boundedNotificationTime(medication, dueAt, leadMs) {
  const dueTime = new Date(dueAt).getTime();
  const lead = Number(leadMs);
  if (!Number.isFinite(dueTime) || !Number.isFinite(lead) || lead < 0) return null;
  const start = medication?.courseStartDate ? parseLocalDate(medication.courseStartDate) : null;
  if (medication?.courseStartDate && !start) return null;
  return Math.max(dueTime - lead, start?.getTime() ?? -Infinity);
}

export function finiteIntervalOccurrences(medication, firstDueAt, intervalMs, count = 8, notBefore = null) {
  const first = new Date(firstDueAt).getTime();
  const interval = Number(intervalMs);
  const requested = Number(count);
  const thresholdTime = notBefore == null ? -Infinity : new Date(notBefore).getTime();
  const start = medication?.courseStartDate ? parseLocalDate(medication.courseStartDate) : null;
  const end = medication?.courseEndDate ? parseLocalDate(medication.courseEndDate) : null;
  if (!medication || !end || (medication.courseStartDate && !start) || !Number.isFinite(first) || !Number.isFinite(interval) || interval <= 0 || !Number.isInteger(requested) || requested < 1 || (notBefore != null && !Number.isFinite(thresholdTime))) return [];
  end.setHours(23, 59, 59, 999);
  const occurrences = [];
  let dueAt = first;
  const minimum = Math.max(start?.getTime() ?? -Infinity, thresholdTime);
  if (dueAt < minimum) dueAt += Math.ceil((minimum - dueAt) / interval) * interval;
  for (let index = 0; occurrences.length < requested; index += 1) {
    if (dueAt > end.getTime()) break;
    occurrences.push(dueAt);
    dueAt += interval;
  }
  return occurrences;
}

export function finiteIntervalReminderOccurrences(medication, firstDueAt, intervalMs, now, count = 8) {
  const first = new Date(firstDueAt).getTime();
  const interval = Number(intervalMs);
  const nowTime = new Date(now).getTime();
  const requested = Number(count);
  const start = medication?.courseStartDate ? parseLocalDate(medication.courseStartDate) : null;
  const end = medication?.courseEndDate ? parseLocalDate(medication.courseEndDate) : null;
  if (!medication || !end || (medication.courseStartDate && !start) || !Number.isFinite(first) || !Number.isFinite(interval) || interval <= 0 || !Number.isFinite(nowTime) || !Number.isInteger(requested) || requested < 1) return [];
  end.setHours(23, 59, 59, 999);
  let firstEligible = first;
  const startTime = start?.getTime() ?? -Infinity;
  if (firstEligible < startTime) firstEligible += Math.ceil((startTime - firstEligible) / interval) * interval;
  if (firstEligible > end.getTime()) return [];
  let dueAt = firstEligible;
  const occurrences = [];
  if (dueAt <= nowTime) {
    dueAt += Math.floor((Math.min(nowTime, end.getTime()) - dueAt) / interval) * interval;
    if (dueAt <= end.getTime()) occurrences.push(dueAt);
    dueAt += interval;
  }
  while (occurrences.length < requested && dueAt <= end.getTime()) {
    if (dueAt > nowTime) occurrences.push(dueAt);
    dueAt += interval;
  }
  return occurrences;
}

function stableIdentifierHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function concreteMedicationReminderId(medicationId, dueAt) {
  const id = typeof medicationId === "string" || typeof medicationId === "number" ? String(medicationId).trim() : "";
  const dueTime = new Date(dueAt).getTime();
  if (!id || !Number.isFinite(dueTime)) return null;
  return `med-${id.slice(0, 120)}-${stableIdentifierHash(id)}-${dueTime}`;
}

export function nextIntervalOccurrence(medication, rawDueAt, intervalMs) {
  const rawDue = new Date(rawDueAt).getTime();
  const interval = Number(intervalMs);
  const start = medication?.courseStartDate ? parseLocalDate(medication.courseStartDate) : null;
  const end = medication?.courseEndDate ? parseLocalDate(medication.courseEndDate) : null;
  if (!medication || !Number.isFinite(rawDue) || !Number.isFinite(interval) || interval <= 0 || (medication.courseStartDate && !start) || (medication.courseEndDate && !end)) return null;
  if (end) return finiteIntervalOccurrences(medication, rawDue, interval, 1)[0] ?? null;
  if (!start || rawDue >= start.getTime()) return rawDue;
  return rawDue + Math.ceil((start.getTime() - rawDue) / interval) * interval;
}

function courseBounds(medication) {
  if (!medication) return null;
  const start = parseLocalDate(medication.courseStartDate);
  const end = parseLocalDate(medication.courseEndDate);
  if ((medication.courseStartDate && !start) || (medication.courseEndDate && !end)) return null;
  if (end) end.setHours(23, 59, 59, 999);
  return { start: start?.getTime() ?? -Infinity, end: end?.getTime() ?? Infinity };
}

export function weeklyOccurrences(medication, after, count = 1) {
  if (!medication) return [];
  const afterTime = new Date(after).getTime();
  const selectedDays = new Set((medication.weekdays || []).map(Number));
  const [hours, minutes] = String(medication.scheduleTime || "09:00").split(":").map(Number);
  const bounds = courseBounds(medication);
  if (!Number.isFinite(afterTime) || !Number.isInteger(count) || count < 1 || !selectedDays.size || !bounds || !Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return [];
  const cursor = new Date(Math.max(afterTime, bounds.start - 86400000));
  cursor.setHours(0, 0, 0, 0);
  const occurrences = [];
  for (let offset = 0; offset < 370 && occurrences.length < count; offset += 1) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() > bounds.end) break;
    if (selectedDays.has(candidate.getDay()) && candidate.getTime() > afterTime && candidate.getTime() >= bounds.start) occurrences.push(candidate.getTime());
  }
  return occurrences;
}

export function cycleOccurrences(medication, after, count = 1) {
  if (!medication) return [];
  const afterTime = new Date(after).getTime();
  const start = parseLocalDate(medication.courseStartDate);
  const [hours, minutes] = String(medication.scheduleTime || "09:00").split(":").map(Number);
  const onDays = Number(medication.cycleOnDays || 5);
  const offDays = Number(medication.cycleOffDays ?? 2);
  const bounds = courseBounds(medication);
  if (!Number.isFinite(afterTime) || !Number.isInteger(count) || count < 1 || !start || !bounds || !Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || !Number.isInteger(onDays) || onDays < 1 || !Number.isInteger(offDays) || offDays < 0) return [];
  const cursor = new Date(Math.max(afterTime, start.getTime() - 86400000));
  cursor.setHours(0, 0, 0, 0);
  const cycleLength = onDays + offDays;
  const occurrences = [];
  for (let offset = 0; offset < 370 && occurrences.length < count; offset += 1) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() > bounds.end) break;
    const dateOnly = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    const daysFromStart = Math.round((dateOnly.getTime() - start.getTime()) / 86400000);
    if (daysFromStart >= 0 && daysFromStart % cycleLength < onDays && candidate.getTime() > afterTime && candidate.getTime() >= bounds.start) occurrences.push(candidate.getTime());
  }
  return occurrences;
}

export function medicationOccurrences(medication, after, count = 1) {
  return medication?.scheduleType === "cycle" ? cycleOccurrences(medication, after, count) : weeklyOccurrences(medication, after, count);
}

export function weeklyScheduleLabel(medication) {
  const selected = new Set((medication.weekdays || []).map(Number));
  const days = WEEKDAYS.filter((day) => selected.has(day.value)).map((day) => day.short);
  return `${days.join(", ")} at ${String(medication.scheduleTime || "09:00")}`;
}

export function medicationScheduleLabel(medication) {
  if (medication.scheduleType !== "cycle") return weeklyScheduleLabel(medication);
  const onDays = medication.cycleOnDays ?? 5;
  const offDays = medication.cycleOffDays ?? 2;
  return `${onDays} ${Number(onDays) === 1 ? "day" : "days"} on / ${offDays} ${Number(offDays) === 1 ? "day" : "days"} off at ${medication.scheduleTime || "09:00"}`;
}

export function medicationDoseLabel(medication) {
  if (!medication || typeof medication !== "object") return "";
  const rawDosage = medication.dosage;
  const dosage = typeof rawDosage === "number" ? rawDosage : typeof rawDosage === "string" ? Number(rawDosage.trim()) : NaN;
  if (!Number.isFinite(dosage) || dosage <= 0) return "";
  const amount = typeof rawDosage === "string" ? rawDosage.trim() : String(rawDosage);
  const unit = typeof medication.dosageUnit === "string" ? medication.dosageUnit.trim() : "";
  return unit ? `${amount} ${unit}` : amount;
}

export function medicationWasTakenRecently(medication, now = Date.now(), windowMs = 5 * 60 * 1000) {
  const takenAt = new Date(medication?.lastTaken).getTime();
  const nowTime = new Date(now).getTime();
  const window = Number(windowMs);
  if (!Number.isFinite(takenAt) || !Number.isFinite(nowTime) || !Number.isFinite(window) || window < 0) return false;
  const elapsed = nowTime - takenAt;
  return elapsed >= 0 && elapsed <= window;
}
