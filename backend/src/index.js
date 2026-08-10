import { app } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import webpush from "web-push";
import {
  createDeviceCredentials,
  minutePartition,
  nextRecurringReminder,
  normalizeReminders,
  reminderRowKey,
  tokenHash,
  tokensMatch,
  validateSubscription,
} from "./reminders.js";

const tableName = process.env.TABLE_NAME || "PushReminders";
const storageConnection = process.env.AzureWebJobsStorage;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
let tablePromise;

function getTable() {
  if (!storageConnection) throw new Error("AzureWebJobsStorage is not configured.");
  if (!tablePromise) {
    const client = TableClient.fromConnectionString(storageConnection, tableName);
    tablePromise = client.createTable().catch((error) => {
      if (error.statusCode !== 409) throw error;
    }).then(() => client);
  }
  return tablePromise;
}

function originFor(request) {
  const origin = request.headers.get("origin") || "";
  return allowedOrigins.has(origin) ? origin : "";
}

function corsHeaders(request) {
  const origin = originFor(request);
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-headers": "authorization, content-type, x-device-id",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  };
}

function json(request, status, body) {
  return { status, headers: corsHeaders(request), jsonBody: body };
}

function mutationOriginAllowed(request) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("The request body must be valid JSON.");
  }
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function authenticateDevice(request, body) {
  const deviceId = String(request.headers.get("x-device-id") || body?.deviceId || "");
  const token = bearerToken(request);
  if (!deviceId || !token) return null;
  const table = await getTable();
  try {
    const device = await table.getEntity("devices", deviceId);
    return device.active !== false && tokensMatch(token, device.tokenHash) ? device : null;
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function deleteDeviceReminders(table, deviceId) {
  const filter = `entityType eq 'reminder' and deviceId eq '${deviceId.replaceAll("'", "''")}'`;
  for await (const entity of table.listEntities({ queryOptions: { filter } })) {
    await table.deleteEntity(entity.partitionKey, entity.rowKey).catch((error) => {
      if (error.statusCode !== 404) throw error;
    });
  }
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID settings are incomplete.");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return publicKey;
}

app.http("push-config", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "push/config",
  handler: async (request) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders(request) };
    try {
      return json(request, 200, { publicKey: configureWebPush() });
    } catch {
      return json(request, 503, { error: "Push reminders are not configured yet." });
    }
  },
});

app.http("push-register", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "push/register",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders(request) };
    if (!mutationOriginAllowed(request)) return json(request, 403, { error: "This origin is not allowed." });
    try {
      const body = await bodyJson(request);
      const subscription = validateSubscription(body.subscription);
      const { deviceId, deviceToken } = createDeviceCredentials();
      const table = await getTable();
      await table.createEntity({
        partitionKey: "devices",
        rowKey: deviceId,
        entityType: "device",
        tokenHash: tokenHash(deviceToken),
        subscriptionJson: JSON.stringify(subscription),
        timezone: String(body.timezone || "UTC").slice(0, 80),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return json(request, 201, { deviceId, deviceToken });
    } catch (error) {
      context.error("Push registration failed", error);
      return json(request, 400, { error: error.message || "Registration failed." });
    }
  },
});

app.http("push-sync", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "push/sync",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders(request) };
    if (!mutationOriginAllowed(request)) return json(request, 403, { error: "This origin is not allowed." });
    try {
      const body = await bodyJson(request);
      const device = await authenticateDevice(request, body);
      if (!device) return json(request, 401, { error: "The device registration is invalid or expired." });
      const reminders = normalizeReminders(body.reminders || []);
      const table = await getTable();
      await deleteDeviceReminders(table, device.rowKey);
      for (const reminder of reminders) {
        await table.upsertEntity({
          partitionKey: minutePartition(reminder.notifyAt),
          rowKey: reminderRowKey(device.rowKey, reminder.id, reminder.notifyAt),
          entityType: "reminder",
          deviceId: device.rowKey,
          reminderId: reminder.id,
          kind: reminder.kind,
          title: reminder.title,
          body: reminder.body,
          url: reminder.url,
          dueAt: reminder.dueAt,
          notifyAt: reminder.notifyAt,
          intervalMs: reminder.intervalMs,
          createdAt: new Date(),
        }, "Replace");
      }
      await table.updateEntity({ ...device, updatedAt: new Date(), timezone: String(body.timezone || device.timezone || "UTC").slice(0, 80) }, "Merge");
      return json(request, 200, { synced: reminders.length, syncedAt: new Date().toISOString() });
    } catch (error) {
      context.error("Reminder sync failed", error);
      return json(request, 400, { error: error.message || "Reminder sync failed." });
    }
  },
});

app.http("push-unsubscribe", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "push/unsubscribe",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders(request) };
    if (!mutationOriginAllowed(request)) return json(request, 403, { error: "This origin is not allowed." });
    try {
      const body = await bodyJson(request);
      const device = await authenticateDevice(request, body);
      if (!device) return json(request, 204, {});
      const table = await getTable();
      await deleteDeviceReminders(table, device.rowKey);
      await table.deleteEntity("devices", device.rowKey).catch((error) => {
        if (error.statusCode !== 404) throw error;
      });
      return json(request, 200, { unsubscribed: true });
    } catch (error) {
      context.error("Push unsubscribe failed", error);
      return json(request, 400, { error: error.message || "Unsubscribe failed." });
    }
  },
});

app.timer("deliver-push-reminders", {
  schedule: "0 * * * * *",
  handler: async (_timer, context) => {
    configureWebPush();
    const table = await getTable();
    const now = new Date();
    let checked = 0;
    let delivered = 0;
    for await (const reminder of table.listEntities({ queryOptions: { filter: "entityType eq 'reminder'" } })) {
      if (new Date(reminder.notifyAt).getTime() > now.getTime()) continue;
      checked += 1;
      let device;
      try {
        device = await table.getEntity("devices", reminder.deviceId);
      } catch (error) {
        if (error.statusCode === 404) {
          await table.deleteEntity(reminder.partitionKey, reminder.rowKey).catch(() => {});
          continue;
        }
        throw error;
      }
      try {
        const subscription = JSON.parse(device.subscriptionJson);
        await webpush.sendNotification(subscription, JSON.stringify({
          title: reminder.title,
          body: reminder.body,
          url: reminder.url || "/",
          tag: `${reminder.deviceId}:${reminder.reminderId}:${new Date(reminder.dueAt).toISOString()}`,
        }), { TTL: 86400, urgency: reminder.kind === "medication" ? "high" : "normal" });
        delivered += 1;
        const next = nextRecurringReminder(reminder, now);
        if (next) {
          await table.upsertEntity({
            ...reminder,
            partitionKey: minutePartition(next.notifyAt),
            rowKey: reminderRowKey(reminder.deviceId, reminder.reminderId, next.notifyAt),
            dueAt: next.dueAt,
            notifyAt: next.notifyAt,
            createdAt: new Date(),
          }, "Replace");
        }
        await table.deleteEntity(reminder.partitionKey, reminder.rowKey);
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await deleteDeviceReminders(table, reminder.deviceId);
          await table.deleteEntity("devices", reminder.deviceId).catch(() => {});
          context.warn(`Removed expired push subscription ${reminder.deviceId}`);
        } else {
          context.error(`Push delivery failed for ${reminder.deviceId}`, error);
        }
      }
    }
    context.log(`Push reminder sweep complete: ${checked} due, ${delivered} delivered.`);
  },
});
