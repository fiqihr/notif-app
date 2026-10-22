import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  compareReminders, getDailyOccurrence, getNextDailyOccurrence, getTaskFormValues, getTaskSchedule,
} from "../src/lib/reminders.mjs";

test("daily reminders start today when the selected time is still ahead", () => {
  assert.equal(getNextDailyOccurrence("08:00", "Asia/Jakarta", new Date("2026-10-22T00:00:00Z")).toISOString(), "2026-10-22T01:00:00.000Z");
});

test("daily reminders start tomorrow after the selected time, including at midnight", () => {
  assert.equal(getNextDailyOccurrence("08:00", "Asia/Jakarta", new Date("2026-10-22T03:00:00Z")).toISOString(), "2026-10-23T01:00:00.000Z");
  assert.equal(getNextDailyOccurrence("00:00", "Asia/Jakarta", new Date("2026-12-31T17:00:00Z")).toISOString(), "2027-01-01T17:00:00.000Z");
});

test("the chosen timezone determines the calendar day", () => {
  assert.equal(getDailyOccurrence("00:05", "Asia/Jakarta", new Date("2026-10-22T18:00:00Z")).toISOString(), "2026-10-22T17:05:00.000Z");
});

test("spring daylight-saving changes preserve local wall-clock schedules", () => {
  assert.equal(getNextDailyOccurrence("08:00", "America/New_York", new Date("2026-03-07T14:00:00Z")).toISOString(), "2026-03-08T12:00:00.000Z");
  assert.equal(getNextDailyOccurrence("02:30", "America/New_York", new Date("2026-03-08T05:00:00Z")).toISOString(), "2026-03-08T07:30:00.000Z");
});

test("the repeated autumn hour does not create a second occurrence on the same day", () => {
  assert.equal(getNextDailyOccurrence("01:30", "America/New_York", new Date("2026-11-01T05:45:00Z")).toISOString(), "2026-11-02T06:30:00.000Z");
});

test("daily form values preserve the selected time and timezone when editing elsewhere", () => {
  const form = getTaskFormValues({
    title: "Obat", recurrence: "daily", dailyTime: "08:15", timeZone: "Asia/Jakarta",
    scheduledTime: Timestamp.fromDate(new Date("2026-10-23T01:15:00Z")),
  });
  assert.equal(form.time, "08:15");
  assert.equal(form.timeZone, "Asia/Jakarta");
  assert.equal(form.repeatDaily, true);
});

test("daily forms need only the time; a hidden or empty date does not affect scheduling", () => {
  const schedule = getTaskSchedule({ repeatDaily: true, date: "", time: "08:00", timeZone: "Asia/Jakarta" }, new Date("2026-10-22T00:00:00Z"));
  assert.equal(schedule.scheduledDate.toISOString(), "2026-10-22T01:00:00.000Z");
  assert.equal(schedule.recurrence, "daily");
  assert.equal(schedule.dailyTime, "08:00");
});

test("turning off daily repetition produces a one-time schedule", () => {
  const schedule = getTaskSchedule({ repeatDaily: false, date: "2026-10-24", time: "09:30", timeZone: "Asia/Jakarta" });
  assert.equal(schedule.scheduledDate.getDate(), 24);
  assert.equal(schedule.scheduledDate.getHours(), 9);
  assert.equal(schedule.scheduledDate.getMinutes(), 30);
  assert.equal(schedule.recurrence, "once");
  assert.equal(schedule.dailyTime, null);
  assert.equal(schedule.timeZone, null);
});

test("pins sort before the five-card limit, with newest items first inside each group", () => {
  const tasks = Array.from({ length: 8 }, (_, index) => ({ id: String(index), createdAt: Timestamp.fromMillis(index + 1) }));
  tasks[0].isPinned = true;
  tasks[2].isPinned = true;
  const sorted = tasks.toSorted(compareReminders);
  assert.deepEqual(sorted.map(task => task.id), ["2", "0", "7", "6", "5", "4", "3", "1"]);
  assert.deepEqual(sorted.slice(0, 5).map(task => task.id), ["2", "0", "7", "6", "5"]);
  tasks[2].isPinned = false;
  assert.deepEqual(tasks.toSorted(compareReminders).slice(0, 2).map(task => task.id), ["0", "7"]);
});
