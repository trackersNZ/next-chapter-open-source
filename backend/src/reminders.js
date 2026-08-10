import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const MAX_REMINDERS_PER_DEVICE = 250;
export const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000;
export const MAX_PAST_MS = 24 * 60 * 60 * 1000;

export function createDeviceCredentials() {
  return {
    deviceId: randomBytes(16).toString("hex"),
    deviceToken: randomBytes(32).toString("base64url"),
  };
}

export function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function tokensMatch(token, expectedHash) {
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function minutePartition(date) {
  return `due-${new Date(date).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
}

export function reminderRowKey(deviceId, reminderId, notifyAt) {
  return `${deviceId}_${createHash("sha256").update(`${reminderId}:${new Date(notifyAt).toISOString()}`).digest("hex").slice(0, 24)}`;
}

export function nextRecurringReminder(reminder, now = new Date()) {
  const intervalMs = Number(reminder.intervalMs || 0);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  const oldDue = new Date(reminder.dueAt).getTime();
  const oldNotify = new Date(reminder.notifyAt).getTime();
  if (!Number.isFinite(oldDue) || !Number.isFinite(oldNotify)) return null;
  const leadMs = Math.max(0, oldDue - oldNotify);
  let dueAt = oldDue + intervalMs;
  while (dueAt - leadMs <= now.getTime()) dueAt += intervalMs;
  const notifyAt = dueAt - leadMs;
  return { ...reminder, dueAt: new Date(dueAt), notifyAt: new Date(notifyAt) };
}

export function validateSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") throw new Error("A push subscription is required.");
  let endpoint;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    throw new Error("The push subscription endpoint is invalid.");
  }
  if (endpoint.protocol !== "https:") throw new Error("The push subscription endpoint must use HTTPS.");
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error("The push subscription keys are incomplete.");
  return {
    endpoint: endpoint.toString(),
    expirationTime: subscription.expirationTime || null,
    keys: {
      p256dh: String(subscription.keys.p256dh),
      auth: String(subscription.keys.auth),
    },
  };
}

export function normalizeReminders(reminders, now = new Date()) {
  if (!Array.isArray(reminders)) throw new Error("Reminders must be an array.");
  if (reminders.length > MAX_REMINDERS_PER_DEVICE) throw new Error(`A maximum of ${MAX_REMINDERS_PER_DEVICE} reminders can be synced at once.`);
  const minTime = now.getTime() - MAX_PAST_MS;
  const maxTime = now.getTime() + MAX_FUTURE_MS;
  return reminders.map((item, index) => {
    const dueAt = new Date(item.dueAt);
    const notifyAt = new Date(item.notifyAt);
    if (!item.id || Number.isNaN(dueAt.getTime()) || Number.isNaN(notifyAt.getTime())) throw new Error(`Reminder ${index + 1} has an invalid ID or time.`);
    if (notifyAt.getTime() < minTime || notifyAt.getTime() > maxTime) throw new Error(`Reminder ${index + 1} is outside the supported scheduling window.`);
    if (notifyAt.getTime() > dueAt.getTime()) throw new Error(`Reminder ${index + 1} cannot notify after it is due.`);
    const intervalMs = item.intervalMs == null ? null : Number(item.intervalMs);
    if (intervalMs != null && (!Number.isFinite(intervalMs) || intervalMs < 60000 || intervalMs > MAX_FUTURE_MS)) throw new Error(`Reminder ${index + 1} has an invalid repeat interval.`);
    return {
      id: String(item.id).slice(0, 160),
      kind: item.kind === "medication" ? "medication" : "todo",
      title: String(item.title || "Next Chapter reminder").slice(0, 100),
      body: String(item.body || "Something needs your attention.").slice(0, 240),
      dueAt,
      notifyAt,
      intervalMs,
      url: ["/", "/#todos", "/#meds"].includes(item.url) ? item.url : "/",
    };
  });
}
