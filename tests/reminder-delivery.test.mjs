import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendDueReminders } from "../src/lib/reminder-delivery.mjs";

const NOW = new Date("2026-10-22T02:00:00Z"); // 09:00 in Jakarta
const stamp = value => Timestamp.fromDate(new Date(value));

function createStore(taskOverrides = {}, userOverrides = {}) {
  const data = new Map([
    ["tasks/task-1", { userId: "user-1", title: "Obat", scheduledTime: stamp("2026-10-22T01:00:00Z"), isNotified: false, ...taskOverrides }],
    ["users/user-1", { fcmToken: "test-token", ...userOverrides }],
  ]);
  const snapshot = ref => {
    const value = data.has(ref.key) ? { ...data.get(ref.key) } : undefined;
    return { id: ref.id, ref, exists: Boolean(value), data: () => value };
  };
  const reference = key => ({ key, id: key.split("/")[1], get: async () => snapshot(reference(key)) });
  let queue = Promise.resolve();
  const db = {
    collection: name => ({
      doc: id => reference(`${name}/${id}`),
      where: (field, _operator, expected) => ({
        get: async () => ({ docs: [...data.keys()].filter(key => key.startsWith(`${name}/`) && data.get(key)[field] === expected).map(key => snapshot(reference(key))) }),
      }),
    }),
    runTransaction: callback => {
      const operation = queue.then(async () => {
        const writes = [];
        const result = await callback({
          get: async ref => snapshot(ref),
          update: (ref, updates) => writes.push([ref, updates]),
        });
        for (const [ref, updates] of writes) {
          assert.ok(data.has(ref.key), "cannot update a deleted document");
          const next = { ...data.get(ref.key) };
          for (const [field, value] of Object.entries(updates)) {
            if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[field];
            else next[field] = value;
          }
          data.set(ref.key, next);
        }
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
  return { db, data, task: () => data.get("tasks/task-1") };
}

const daily = { recurrence: "daily", dailyTime: "08:00", timeZone: "Asia/Jakarta" };

test("legacy one-time reminders still send once and finish", async () => {
  const store = createStore();
  let sent = 0;
  const messaging = { send: async () => { sent++; } };
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 1);
  assert.equal(store.task().isNotified, true);
  assert.equal(store.task().notificationLeaseId, undefined);
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 0);
  assert.equal(sent, 1);
});

test("daily reminders advance to tomorrow and remain editable and active", async () => {
  const store = createStore({ ...daily, isPinned: true });
  let sent = 0;
  const messaging = { send: async () => { sent++; } };
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 1);
  assert.equal(store.task().scheduledTime.toDate().toISOString(), "2026-10-23T01:00:00.000Z");
  assert.equal(store.task().isNotified, false);
  assert.equal(store.task().isPinned, true);
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 0);
  assert.equal(await sendDueReminders(store.db, messaging, () => new Date("2026-10-23T01:01:00Z")), 1);
  assert.equal(sent, 2);
});

test("overlapping cron requests cannot send the same occurrence twice", async () => {
  const store = createStore(daily);
  let started;
  let release;
  const sending = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let sent = 0;
  const messaging = { send: async () => { sent++; started(); await blocked; } };
  const first = sendDueReminders(store.db, messaging, () => NOW);
  await sending;
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 0);
  release();
  assert.equal(await first, 1);
  assert.equal(sent, 1);
});

test("missing recipient tokens release the lease for a later retry", async () => {
  const store = createStore(daily, { fcmToken: null });
  const messaging = { send: async () => { assert.fail("must not send without a token"); } };
  assert.equal(await sendDueReminders(store.db, messaging, () => NOW), 0);
  assert.equal(store.task().notificationLeaseId, undefined);
  assert.equal(store.task().scheduledTime.toDate().toISOString(), "2026-10-22T01:00:00.000Z");
});

test("expired delivery leases can be retried", async () => {
  const store = createStore({ ...daily, notificationLeaseId: "expired", notificationLeaseUntil: stamp("2026-10-22T01:59:00Z") });
  assert.equal(await sendDueReminders(store.db, { send: async () => {} }, () => NOW), 1);
});

test("missed days do not send early before today's selected time", async () => {
  const store = createStore({ ...daily, scheduledTime: stamp("2026-10-20T01:00:00Z") });
  const morning = new Date("2026-10-22T00:00:00Z");
  assert.equal(await sendDueReminders(store.db, { send: async () => assert.fail("too early") }, () => morning), 0);
  assert.equal(store.task().scheduledTime.toDate().toISOString(), "2026-10-22T01:00:00.000Z");
});

test("missed days send once after today's selected time, without a backlog", async () => {
  const store = createStore({ ...daily, scheduledTime: stamp("2026-10-20T01:00:00Z") });
  let sent = 0;
  assert.equal(await sendDueReminders(store.db, { send: async () => { sent++; } }, () => NOW), 1);
  assert.equal(sent, 1);
  assert.equal(store.task().scheduledTime.toDate().toISOString(), "2026-10-23T01:00:00.000Z");
});

test("a schedule edited during delivery is not overwritten by cron", async () => {
  const store = createStore(daily);
  const editedTime = stamp("2026-10-22T05:00:00Z");
  await sendDueReminders(store.db, {
    send: async () => store.data.set("tasks/task-1", { ...store.task(), dailyTime: "12:00", scheduledTime: editedTime, notificationLeaseId: undefined }),
  }, () => NOW);
  assert.equal(store.task().scheduledTime, editedTime);
  assert.equal(store.task().dailyTime, "12:00");
  assert.equal(store.task().isNotified, false);
});

test("failed sends remain pending and can be retried", async () => {
  const store = createStore(daily);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await sendDueReminders(store.db, { send: async () => { throw new Error("offline"); } }, () => NOW), 0);
  } finally {
    console.error = originalError;
  }
  assert.equal(store.task().isNotified, false);
  assert.equal(store.task().notificationLeaseId, undefined);
  assert.equal(await sendDueReminders(store.db, { send: async () => {} }, () => NOW), 1);
});
