import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDailyOccurrence, getNextDailyOccurrence, isReminderDue } from "./reminders.mjs";

const LEASE_DURATION_MS = 120_000;

function clearLease() {
  return {
    notificationLeaseId: FieldValue.delete(),
    notificationLeaseUntil: FieldValue.delete(),
  };
}

// FCM runs outside the transaction: Firestore may retry a transaction callback.
export async function sendDueReminders(db, messaging, clock = () => new Date()) {
  const snapshot = await db.collection("tasks").where("isNotified", "==", false).get();
  const pending = snapshot.docs.filter(doc => isReminderDue(doc.data(), clock()));
  let count = 0;

  for (const taskDoc of pending) {
    const leaseId = randomUUID();
    let hasLease = false;
    let sent = false;
    let recipientToken;
    let recipientId;

    try {
      const task = await db.runTransaction(async transaction => {
        const current = await transaction.get(taskDoc.ref);
        if (!current.exists) return null;
        const task = current.data();
        const now = clock();
        if (!isReminderDue(task, now) || task.notificationLeaseUntil?.toMillis() > now.getTime()) return null;

        if (task.recurrence === "daily") {
          const today = getDailyOccurrence(task.dailyTime, task.timeZone, now);
          // Skip missed days; do not send yesterday's reminder before today's chosen time.
          if (today > now && task.scheduledTime.toMillis() < today.getTime()) {
            transaction.update(taskDoc.ref, { scheduledTime: Timestamp.fromDate(today) });
            return null;
          }
        }

        transaction.update(taskDoc.ref, {
          notificationLeaseId: leaseId,
          notificationLeaseUntil: Timestamp.fromMillis(now.getTime() + LEASE_DURATION_MS),
        });
        return task;
      });
      if (!task) continue;
      hasLease = true;
      recipientId = task.userId;

      const user = await db.collection("users").doc(task.userId).get();
      recipientToken = user.exists ? user.data().fcmToken : null;
      if (!recipientToken) continue;

      // An edit or deletion may have happened while fetching the recipient.
      const latest = await taskDoc.ref.get();
      if (!latest.exists || latest.data().notificationLeaseId !== leaseId || !isReminderDue(latest.data(), clock())) continue;
      const deliveryTask = latest.data();

      await messaging.send({
        token: recipientToken,
        notification: {
          title: `⏰ ${deliveryTask.title}`,
          body: deliveryTask.description || "Waktunya mengerjakan tugasmu!",
        },
        webpush: {
          notification: { icon: "/icon.jpg", vibrate: [200, 100, 200, 100, 200, 100, 200] },
          fcmOptions: { link: "/" },
        },
      });
      sent = true;

      await db.runTransaction(async transaction => {
        const current = await transaction.get(taskDoc.ref);
        if (!current.exists || current.data().notificationLeaseId !== leaseId) return;
        const now = clock();
        const updates = { ...clearLease(), notifiedAt: Timestamp.fromDate(now), isNotified: true };
        if (task.recurrence === "daily") {
          updates.isNotified = false;
          updates.scheduledTime = Timestamp.fromDate(getNextDailyOccurrence(task.dailyTime, task.timeZone, now));
        }
        transaction.update(taskDoc.ref, updates);
      });
      hasLease = false;
      count++;
    } catch (error) {
      console.error(`Gagal mengirim pengingat ${taskDoc.id}:`, error);
      if (error.code === "messaging/registration-token-not-registered" && recipientId) {
        const userRef = db.collection("users").doc(recipientId);
        await db.runTransaction(async transaction => {
          const user = await transaction.get(userRef);
          if (user.exists && user.data().fcmToken === recipientToken) {
            transaction.update(userRef, { fcmToken: null });
          }
        });
      }
    } finally {
      if (hasLease && !sent) {
        await db.runTransaction(async transaction => {
          const current = await transaction.get(taskDoc.ref);
          if (current.exists && current.data().notificationLeaseId === leaseId) {
            transaction.update(taskDoc.ref, clearLease());
          }
        });
      }
    }
  }

  return count;
}
