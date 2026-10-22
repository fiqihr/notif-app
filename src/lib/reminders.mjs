import { Temporal } from "@js-temporal/polyfill";

export function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getDailyOccurrence(time, timeZone, reference = new Date()) {
  const day = Temporal.Instant.fromEpochMilliseconds(reference.getTime())
    .toZonedDateTimeISO(timeZone).toPlainDate();
  const occurrence = day.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from(time) });
  return new Date(occurrence.epochMilliseconds);
}

export function getNextDailyOccurrence(time, timeZone, after = new Date()) {
  const instant = Temporal.Instant.fromEpochMilliseconds(after.getTime());
  const today = instant.toZonedDateTimeISO(timeZone).toPlainDate();
  const plainTime = Temporal.PlainTime.from(time);
  let next = today.toZonedDateTime({ timeZone, plainTime });
  if (next.epochMilliseconds <= after.getTime()) {
    next = today.add({ days: 1 }).toZonedDateTime({ timeZone, plainTime });
  }
  return new Date(next.epochMilliseconds);
}

export function getTaskFormValues(task) {
  const date = task.scheduledTime.toDate();
  const repeatDaily = task.recurrence === "daily";
  return {
    title: task.title,
    description: task.description || "",
    date: formatDateInput(date),
    time: repeatDaily ? task.dailyTime : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    repeatDaily,
    timeZone: task.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function getTaskSchedule(form, now = new Date()) {
  const timeZone = form.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    scheduledDate: form.repeatDaily
      ? getNextDailyOccurrence(form.time, timeZone, now)
      : new Date(`${form.date}T${form.time}:00`),
    recurrence: form.repeatDaily ? "daily" : "once",
    dailyTime: form.repeatDaily ? form.time : null,
    timeZone: form.repeatDaily ? timeZone : null,
  };
}

export function compareReminders(a, b) {
  const pinOrder = Number(b.isPinned === true) - Number(a.isPinned === true);
  if (pinOrder) return pinOrder;
  const timeA = (a.createdAt || a.scheduledTime)?.toMillis() || 0;
  const timeB = (b.createdAt || b.scheduledTime)?.toMillis() || 0;
  return timeB - timeA || a.id.localeCompare(b.id);
}

export function isReminderDue(task, now = new Date()) {
  return task.isNotified === false && task.scheduledTime?.toMillis() <= now.getTime();
}
