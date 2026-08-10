import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeviceCredentials,
  minutePartition,
  nextRecurringReminder,
  normalizeReminders,
  tokenHash,
  tokensMatch,
  validateSubscription,
} from "../src/reminders.js";

test("device credentials are random and verifiable without storing the token", () => {
  const first = createDeviceCredentials();
  const second = createDeviceCredentials();
  assert.notEqual(first.deviceId, second.deviceId);
  assert.notEqual(first.deviceToken, second.deviceToken);
  assert.equal(tokensMatch(first.deviceToken, tokenHash(first.deviceToken)), true);
  assert.equal(tokensMatch(second.deviceToken, tokenHash(first.deviceToken)), false);
});

test("minute partitions are stable UTC keys", () => {
  assert.equal(minutePartition("2026-07-30T11:22:59.000Z"), "due-202607301122");
});

test("recurring reminders advance beyond now while preserving lead time", () => {
  const result = nextRecurringReminder({
    dueAt: new Date("2026-07-30T10:00:00.000Z"),
    notifyAt: new Date("2026-07-30T09:30:00.000Z"),
    intervalMs: 60 * 60 * 1000,
  }, new Date("2026-07-30T12:45:00.000Z"));
  assert.equal(result.dueAt.toISOString(), "2026-07-30T14:00:00.000Z");
  assert.equal(result.notifyAt.toISOString(), "2026-07-30T13:30:00.000Z");
});

test("subscriptions require HTTPS and browser keys", () => {
  assert.throws(() => validateSubscription({ endpoint: "http://example.test", keys: {} }), /HTTPS/);
  const subscription = validateSubscription({ endpoint: "https://push.example.test/id", keys: { p256dh: "key", auth: "auth" } });
  assert.equal(subscription.endpoint, "https://push.example.test/id");
});

test("reminder normalization validates and trims client payloads", () => {
  const now = new Date("2026-07-30T00:00:00.000Z");
  const [reminder] = normalizeReminders([{
    id: "todo-1",
    kind: "todo",
    title: "A timed task",
    body: "Nearly due",
    notifyAt: "2026-07-30T00:30:00.000Z",
    dueAt: "2026-07-30T01:00:00.000Z",
    url: "/#todos",
  }], now);
  assert.equal(reminder.title, "A timed task");
  assert.equal(reminder.notifyAt.toISOString(), "2026-07-30T00:30:00.000Z");
  assert.throws(() => normalizeReminders([{ ...reminder, notifyAt: "2028-01-01T00:00:00.000Z" }], now), /outside/);
});
