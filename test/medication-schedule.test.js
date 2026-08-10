import assert from "node:assert/strict";
import test from "node:test";
import { boundedNotificationTime, concreteMedicationReminderId, cycleOccurrences, finiteIntervalOccurrences, finiteIntervalReminderOccurrences, formatLocalDate, inclusiveCourseEndDate, medicationDoseLabel, medicationOccurrences, medicationScheduleLabel, medicationWasTakenRecently, nextIntervalOccurrence, parseLocalDate, weeklyOccurrences, weeklyScheduleLabel } from "../medication-schedule.js";
import { reminderRowKey } from "../backend/src/reminders.js";

test("weekly schedules find the next selected weekday", () => {
  const mondayAtTen = new Date(2026, 7, 3, 10, 0);
  const schedule = { weekdays: [1, 4], scheduleTime: "09:00" };
  const [next] = weeklyOccurrences(schedule, mondayAtTen, 1);
  const result = new Date(next);
  assert.equal(result.getDay(), 4);
  assert.equal(result.getHours(), 9);
  assert.equal(result.getMinutes(), 0);
});

test("weekly schedules can produce alternating twice-weekly occurrences", () => {
  const schedule = { weekdays: [1, 4], scheduleTime: "09:00" };
  const results = weeklyOccurrences(schedule, new Date(2026, 7, 3, 8, 0), 4).map((time) => new Date(time).getDay());
  assert.deepEqual(results, [1, 4, 1, 4]);
  assert.equal(weeklyScheduleLabel(schedule), "Mon, Thu at 09:00");
});

test("local calendar helpers calculate inclusive finite-course dates", () => {
  assert.equal(inclusiveCourseEndDate("2026-08-03", 4, "weeks"), "2026-08-30");
  assert.equal(inclusiveCourseEndDate("2028-02-27", 4, "days"), "2028-03-01");
  assert.equal(inclusiveCourseEndDate("2026-01-30", 4, "days"), "2026-02-02");
  assert.equal(formatLocalDate(parseLocalDate("2026-08-03")), "2026-08-03");
  assert.equal(parseLocalDate("2026-02-30"), null);
});

test("medication dose labels normalize valid dosages and omit invalid values", () => {
  assert.equal(medicationDoseLabel({ dosage: 500, dosageUnit: " mcg " }), "500 mcg");
  assert.equal(medicationDoseLabel({ dosage: " 0.25 ", dosageUnit: " mL " }), "0.25 mL");
  assert.equal(medicationDoseLabel({ dosage: 2, dosageUnit: "mg" }), "2 mg");
  assert.equal(medicationDoseLabel({ dosage: 2 }), "2");
  assert.equal(medicationDoseLabel({}), "");
  assert.equal(medicationDoseLabel({ dosage: "" }), "");
  assert.equal(medicationDoseLabel({ dosage: 0, dosageUnit: "mg" }), "");
  assert.equal(medicationDoseLabel({ dosage: -1, dosageUnit: "mg" }), "");
  assert.equal(medicationDoseLabel({ dosage: "not a number", dosageUnit: "mg" }), "");
  assert.equal(medicationDoseLabel({ dosage: Infinity, dosageUnit: "mg" }), "");
});

test("a newly logged medication stays acknowledged during the immediate UI refresh", () => {
  const now = new Date("2026-08-10T09:00:00.000Z");
  assert.equal(medicationWasTakenRecently({ lastTaken: "2026-08-10T08:59:59.500Z" }, now), true);
  assert.equal(medicationWasTakenRecently({ lastTaken: "2026-08-10T08:54:59.999Z" }, now), false);
  assert.equal(medicationWasTakenRecently({ lastTaken: "not-a-date" }, now), false);
  assert.equal(medicationWasTakenRecently({ lastTaken: "2026-08-10T09:00:01.000Z" }, now), false);
});

test("weekly occurrences honor inclusive course bounds", () => {
  const schedule = { weekdays: [1, 3, 5], scheduleTime: "09:00", courseStartDate: "2026-08-03", courseEndDate: "2026-08-14" };
  const dates = weeklyOccurrences(schedule, new Date(2026, 7, 1, 12), 8).map((time) => formatLocalDate(new Date(time)));
  assert.deepEqual(dates, ["2026-08-03", "2026-08-05", "2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14"]);
  assert.deepEqual(weeklyOccurrences(schedule, new Date(2026, 7, 14, 9), 1), []);
});

test("cycle schedules emit five days, skip two days, repeat, and respect bounds", () => {
  const schedule = { scheduleType: "cycle", cycleOnDays: 5, cycleOffDays: 2, scheduleTime: "21:00", courseStartDate: "2026-08-03", courseEndDate: "2026-08-12" };
  const dates = cycleOccurrences(schedule, new Date(2026, 7, 2, 12), 12).map((time) => formatLocalDate(new Date(time)));
  assert.deepEqual(dates, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11", "2026-08-12"]);
  assert.deepEqual(medicationOccurrences(schedule, new Date(2026, 7, 2, 12), 2), cycleOccurrences(schedule, new Date(2026, 7, 2, 12), 2));
  assert.equal(medicationScheduleLabel(schedule), "5 days on / 2 days off at 21:00");
  assert.equal(medicationScheduleLabel({ ...schedule, cycleOnDays: 6, cycleOffDays: 1 }), "6 days on / 1 day off at 21:00");
  assert.equal(medicationScheduleLabel({ ...schedule, cycleOnDays: 1, cycleOffDays: 0 }), "1 day on / 0 days off at 21:00");
});

test("cycle schedules allow zero days off", () => {
  const schedule = { scheduleType: "cycle", cycleOnDays: 1, cycleOffDays: 0, scheduleTime: "09:00", courseStartDate: "2026-08-03", courseEndDate: "2026-08-06" };
  const dates = cycleOccurrences(schedule, new Date(2026, 7, 2, 12), 8).map((time) => formatLocalDate(new Date(time)));
  assert.deepEqual(dates, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
});

test("notification times clamp to local course-start midnight but unbounded schedules keep the lead time", () => {
  const dueAt = new Date(2026, 7, 3, 9, 0).getTime();
  assert.equal(formatLocalDate(new Date(boundedNotificationTime({ courseStartDate: "2026-08-03" }, dueAt, 86400000))), "2026-08-03");
  assert.equal(new Date(boundedNotificationTime({ courseStartDate: "2026-08-03" }, dueAt, 86400000)).getHours(), 0);
  assert.equal(boundedNotificationTime({}, dueAt, 3600000), dueAt - 3600000);
  assert.equal(boundedNotificationTime({ courseStartDate: "not-a-date" }, dueAt, 0), null);
  assert.equal(boundedNotificationTime({}, dueAt, -1), null);
});

test("finite interval occurrences end inclusively and reject invalid inputs", () => {
  const medication = { courseStartDate: "2026-08-03", courseEndDate: "2026-08-04" };
  const first = new Date(2026, 7, 3, 9, 0).getTime();
  const occurrences = finiteIntervalOccurrences(medication, first, 12 * 3600000, 8);
  assert.deepEqual(occurrences.map((time) => formatLocalDate(new Date(time))), ["2026-08-03", "2026-08-03", "2026-08-04", "2026-08-04"]);
  assert.ok(occurrences.every((time) => time <= new Date(2026, 7, 4, 23, 59, 59, 999).getTime()));
  assert.deepEqual(finiteIntervalOccurrences(medication, first, 0), []);
  assert.deepEqual(finiteIntervalOccurrences({ courseEndDate: "invalid" }, first, 3600000), []);
  assert.deepEqual(finiteIntervalOccurrences({}, first, 3600000), []);
});

test("finite interval occurrences jump past stale doses before collecting the current horizon", () => {
  const interval = 86400000;
  const first = new Date(2026, 6, 1, 9, 0).getTime();
  const notBefore = first + (20 * interval) + 1;
  const medication = { courseStartDate: "2026-07-01", courseEndDate: "2026-08-31" };
  const occurrences = finiteIntervalOccurrences(medication, first, interval, 3, notBefore);
  assert.equal(occurrences.length, 3);
  assert.ok(occurrences.every((time) => time >= notBefore));
  assert.equal(occurrences[0], first + (21 * interval));
  assert.deepEqual(finiteIntervalOccurrences(medication, first, interval, 3, "not-a-date"), []);
});

test("finite interval reminder occurrences include only one current dose before the future horizon", () => {
  const interval = 3600000;
  const now = new Date(2026, 7, 3, 12, 30).getTime();
  const first = now - (30.5 * interval);
  const medication = { courseStartDate: "2026-07-01", courseEndDate: "2026-08-05" };
  const occurrences = finiteIntervalReminderOccurrences(medication, first, interval, now, 8);
  assert.ok(occurrences.length <= 8 && occurrences.length > 1);
  assert.equal(occurrences.filter((time) => time <= now).length, 1);
  assert.ok(occurrences.slice(1).every((time) => time > now));
  assert.deepEqual([...occurrences].sort((a, b) => a - b), occurrences);
  assert.ok(occurrences.every((time) => time <= new Date(2026, 7, 5, 23, 59, 59, 999).getTime()));
  const futureFirst = now + interval;
  assert.deepEqual(finiteIntervalReminderOccurrences(medication, futureFirst, interval, now, 2), [futureFirst, futureFirst + interval]);
  assert.deepEqual(finiteIntervalReminderOccurrences(medication, first, 0, now), []);
  assert.deepEqual(finiteIntervalReminderOccurrences({ courseEndDate: "invalid" }, first, interval, now), []);
});

test("concrete reminder IDs keep clamped notification rows distinct", () => {
  const medicationId = "course-medication";
  const courseStart = new Date(2026, 7, 3, 0, 0).getTime();
  const dueTimes = Array.from({ length: 8 }, (_, index) => courseStart + ((index + 1) * 3600000));
  const sharedNotifyAt = new Date(courseStart).toISOString();
  const rowKeys = dueTimes.map((dueAt) => reminderRowKey("device", concreteMedicationReminderId(medicationId, dueAt), sharedNotifyAt));
  assert.equal(new Set(rowKeys).size, 8);
  assert.ok(dueTimes.every((dueAt) => concreteMedicationReminderId(medicationId, dueAt).length <= 160));
  assert.equal(concreteMedicationReminderId("", dueTimes[0]), null);
  assert.equal(concreteMedicationReminderId("med", "not-a-date"), null);
});

test("interval next occurrence respects course start and finite course end", () => {
  const interval = 86400000;
  const rawDueAt = new Date(2026, 7, 1, 9, 0).getTime();
  const finiteMedication = { courseStartDate: "2026-08-03", courseEndDate: "2026-08-05" };
  const dueAt = nextIntervalOccurrence(finiteMedication, rawDueAt, interval);
  assert.equal(formatLocalDate(new Date(dueAt)), "2026-08-03");
  assert.ok(dueAt >= parseLocalDate("2026-08-03").getTime());
  assert.equal(nextIntervalOccurrence(finiteMedication, new Date(2026, 7, 6, 9, 0), interval), null);
  assert.equal(formatLocalDate(new Date(nextIntervalOccurrence({ courseStartDate: "2026-08-03" }, rawDueAt, interval))), "2026-08-03");
  assert.equal(nextIntervalOccurrence({ courseStartDate: "invalid" }, rawDueAt, interval), null);
});
