"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { messaging, db } from "@/lib/firebase";
import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc, collection, addDoc, query, where, onSnapshot, Timestamp, deleteDoc, runTransaction, deleteField } from "firebase/firestore";
import { DeleteTaskDialog } from "@/components/delete-task-dialog";
import { AnimatedReminderCard } from "@/components/animated-reminder-card";
import { AnimatedReminderDialog } from "@/components/animated-reminder-dialog";
import { compareReminders, formatDateInput, getTaskFormValues, getTaskSchedule } from "@/lib/reminders.mjs";
import { toast } from "sonner";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permissionStatus, setPermissionStatus] = useState("default");

  // State untuk Tugas
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", date: "", time: "", repeatDaily: false, timeZone: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [pinningTaskIds, setPinningTaskIds] = useState([]);
  const resetFormOnCloseRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const handleFormClosed = useCallback(() => {
    if (!resetFormOnCloseRef.current) return;
    resetFormOnCloseRef.current = false;
    setForm({ title: "", description: "", date: "", time: "", repeatDaily: false, timeZone: "" });
    setEditingTaskId(null);
  }, []);

  const handleOpenForm = () => {
    const today = formatDateInput(new Date());

    setForm(currentForm => editingTaskId
      ? { title: "", description: "", date: today, time: "", repeatDaily: false, timeZone: "" }
      : { ...currentForm, date: currentForm.date || today });
    setEditingTaskId(null);
    setIsFormOpen(true);
  };

  const handleEditTask = (task) => {
    if (task.isNotified && task.recurrence !== "daily") return;
    setForm(getTaskFormValues(task));
    setEditingTaskId(task.id);
    setIsFormOpen(true);
  };

  // Fetch data secara real-time
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = [];
      snapshot.forEach((doc) => tasksData.push({ id: doc.id, ...doc.data() }));
      // Pin diprioritaskan sebelum daftar dibatasi menjadi lima kartu.
      tasksData.sort(compareReminders);
      setTasks(tasksData);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (isSubmitting || !form.title || (!form.repeatDaily && !form.date) || !form.time) return;
    setIsSubmitting(true);

    try {
      const schedule = getTaskSchedule(form);

      const taskValues = {
        title: form.title,
        description: form.description,
        scheduledTime: Timestamp.fromDate(schedule.scheduledDate),
        recurrence: schedule.recurrence,
        dailyTime: schedule.dailyTime,
        timeZone: schedule.timeZone,
      };

      if (editingTaskId) {
        const taskRef = doc(db, "tasks", editingTaskId);
        const updated = await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(taskRef);
          if (!snapshot.exists() || snapshot.data().userId !== user.uid || (snapshot.data().isNotified && snapshot.data().recurrence !== "daily")) {
            return false;
          }
          const currentTask = snapshot.data();
          const updates = {
            ...taskValues,
            isNotified: false,
          };
          // Editing text must not skip today's still-pending daily notification.
          if (form.repeatDaily && currentTask.recurrence === "daily" && currentTask.dailyTime === schedule.dailyTime && currentTask.timeZone === schedule.timeZone) {
            updates.scheduledTime = currentTask.scheduledTime;
          }
          const scheduleChanged = updates.scheduledTime.toMillis() !== currentTask.scheduledTime.toMillis() ||
            updates.recurrence !== (currentTask.recurrence || "once") ||
            updates.dailyTime !== (currentTask.dailyTime || null) || updates.timeZone !== (currentTask.timeZone || null);
          if (scheduleChanged) {
            updates.notificationLeaseId = deleteField();
            updates.notificationLeaseUntil = deleteField();
          }
          transaction.update(taskRef, updates);
          return true;
        });
        if (!updated) {
          alert("Pengingat sudah selesai atau dihapus, sehingga tidak dapat diedit.");
          setIsFormOpen(false);
          return;
        }
      } else {
        await addDoc(collection(db, "tasks"), {
          ...taskValues,
          userId: user.uid,
          isNotified: false,
          isPinned: false,
          createdAt: Timestamp.now(),
        });
      }

      resetFormOnCloseRef.current = true;
      setIsFormOpen(false);
    } catch (error) {
      console.error("Gagal menyimpan pengingat", error);
      alert("Gagal menyimpan pengingat.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = (taskId) => deleteDoc(doc(db, "tasks", taskId));

  const handleTogglePin = async (taskId) => {
    if (pinningTaskIds.includes(taskId)) return;
    setPinningTaskIds(current => [...current, taskId]);
    try {
      const taskRef = doc(db, "tasks", taskId);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(taskRef);
        if (!snapshot.exists() || snapshot.data().userId !== user.uid) {
          throw new Error("Pengingat tidak ditemukan.");
        }
        transaction.update(taskRef, { isPinned: snapshot.data().isPinned !== true });
      });
    } catch (error) {
      console.warn("Gagal mengubah pin:", error);
      toast.error("Gagal mengubah pin pengingat. Silakan coba lagi.");
    } finally {
      setPinningTaskIds(current => current.filter(id => id !== taskId));
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const currentStatus = Notification.permission;
      setPermissionStatus(currentStatus);

      // Jika sebelumnya sudah pernah diberi izin (tapi gagal simpan token), coba simpan lagi diam-diam
      if (currentStatus === "granted" && user) {
        requestNotificationPermission(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Listener untuk Notifikasi Foreground (saat web/PWA sedang terbuka)
  useEffect(() => {
    if (typeof window !== "undefined" && messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log("Pesan diterima di Foreground:", payload);
        // Tampilkan notifikasi secara manual lewat Service Worker
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(payload.notification.title, {
              body: payload.notification.body,
              icon: '/icon.jpg',
              vibrate: [200, 100, 200, 100, 200, 100, 200],
            });
          });
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const requestNotificationPermission = async (silent = false) => {
    try {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);

      if (permission === "granted") {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!messaging) {
          console.warn("Messaging is not supported on this browser.");
          return;
        }

        try {
          // Registrasi Service Worker secara eksplisit untuk mencegah "push service error"
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          console.log("Service Worker terdaftar dengan scope:", registration.scope);

          const currentToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration
          });

          if (currentToken) {
            console.log("FCM Token didapat!", currentToken);
            // Simpan token ke Firestore
            await updateDoc(doc(db, "users", user.uid), {
              fcmToken: currentToken
            });
            if (!silent) alert("Notifikasi berhasil diaktifkan!");
          } else {
            console.log("Tidak ada registrasi token.");
          }
        } catch (e) {
          console.error("Gagal mendapatkan FCM Token:", e);
          if (!silent) alert("Gagal mendapatkan Token Push Service. Pastikan kamu tidak memblokirnya di pengaturan browser.");
        }
      }
    } catch (error) {
      console.error("Gagal mendapatkan izin notifikasi:", error);
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const userName = user.displayName?.trim() || user.email?.split("@")[0] || "Kawan";

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/80 border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h1 className="font-bold text-xl tracking-tight text-zinc-100">NotifApp</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 mr-2">
              <div className="text-right">
                <p className="text-sm font-medium text-zinc-200">{userName}</p>
                <p className="text-xs text-zinc-500">{user.email}</p>
              </div>
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="Profile" className="w-9 h-9 rounded-full ring-2 ring-white/10" />
            </div>
            <button
              onClick={logout}
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-zinc-100 mb-2">Halo, {userName.split(/\s+/)[0]}! 👋</h2>
          <p className="text-zinc-400">Siap untuk menjadwalkan tugas pentingmu hari ini?</p>
        </div>

        {/* Banner Izin Notifikasi */}
        {permissionStatus !== "granted" && (
          <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-cyan-900/40 to-purple-900/40 border border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-cyan-300 mb-1">Aktifkan Notifikasi Web</h3>
              <p className="text-sm text-zinc-300">Kami perlu izinmu agar bisa mengirimkan pengingat tepat waktu ke perangkat ini.</p>
            </div>
            <button
              onClick={requestNotificationPermission}
              className="whitespace-nowrap px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              Berikan Izin
            </button>
          </div>
        )}

        {/* Daftar pengingat */}
        <section className="space-y-4" aria-labelledby="tasks-heading">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 id="tasks-heading" className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Jadwal Mendatang
            </h3>
            <button
              type="button"
              onClick={handleOpenForm}
              aria-haspopup="dialog"
              aria-controls="reminder-dialog"
              className="hidden sm:inline-flex items-center gap-2 shrink-0 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Buat Pengingat
            </button>
          </div>

          <LayoutGroup>
            <div className="relative grid gap-4">
              <AnimatePresence initial={false} mode="popLayout">
                {tasks.length === 0 ? (
                  <motion.div key="empty-reminders" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center h-48">
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-zinc-400">Belum ada pengingat.</p>
                  </motion.div>
                ) : (
                  (showAllTasks ? tasks : tasks.slice(0, 5)).map(task => {
                    const date = task.scheduledTime?.toDate() || new Date();
                    const isDaily = task.recurrence === "daily";
                    const isFinished = task.isNotified && !isDaily;
                    const isPast = date < new Date() && !isFinished;

                    return (
                      <AnimatedReminderCard key={task.id} finished={isFinished} className={`p-5 rounded-2xl border transition-colors duration-200 motion-reduce:transition-none ${isFinished ? 'bg-zinc-900/30 border-white/5' : isPast ? 'bg-red-900/20 border-red-500/20' : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'} flex items-start gap-4`}>
                        <div className={`mt-1 w-10 h-10 rounded-full flex shrink-0 items-center justify-center ${isFinished ? 'bg-zinc-800 text-zinc-500' : 'bg-cyan-500/10 text-cyan-400'}`}>
                          {isFinished ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex sm:items-center sm:justify-between flex-col sm:flex-row gap-1 mb-1">
                            <h4 className={`font-bold text-lg truncate ${isFinished ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{task.title}</h4>
                            <span title={isDaily ? `Zona waktu: ${task.timeZone}` : undefined} className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${isFinished ? 'bg-zinc-800 text-zinc-400' : 'bg-purple-500/20 text-purple-300'}`}>
                              {isDaily ? `Setiap hari • ${task.dailyTime}` : `${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} • ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                            </span>
                          </div>
                          {task.description && <p className="text-sm text-zinc-400 truncate mb-2">{task.description}</p>}

                          {/* Aksi pengingat */}
                          <div className="flex justify-end gap-3 mt-2">
                            <button
                              type="button"
                              onClick={() => handleTogglePin(task.id)}
                              disabled={pinningTaskIds.includes(task.id)}
                              aria-pressed={task.isPinned === true}
                              aria-label={`Pin pengingat ${task.title}`}
                              title={task.isPinned ? "Lepas pin" : "Pin ke atas"}
                              className={`transition-colors p-1 rounded-lg hover:bg-cyan-500/10 flex items-center gap-1 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-50 ${task.isPinned ? 'text-cyan-400' : 'text-zinc-500 hover:text-cyan-400'}`}
                            >
                              <svg aria-hidden="true" className="w-4 h-4" fill={task.isPinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="m16 3 5 5-4 1-3 5v3l-7-7h3l5-3 1-4ZM8 16l-5 5" />
                              </svg>
                              <span className="hidden sm:inline">{task.isPinned ? "Dipin" : "Pin"}</span>
                            </button>
                            {!isFinished && (
                              <button
                                type="button"
                                onClick={() => handleEditTask(task)}
                                aria-label={`Edit pengingat ${task.title}`}
                                aria-haspopup="dialog"
                                aria-controls="reminder-dialog"
                                className="text-zinc-500 hover:text-cyan-400 transition-colors p-1 rounded-lg hover:bg-cyan-500/10 flex items-center gap-1 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400"
                                title="Edit pengingat"
                              >
                                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5a2.121 2.121 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5ZM15 5l3 3" />
                                </svg>
                                <span className="hidden sm:inline">Edit</span>
                              </button>
                            )}
                            <DeleteTaskDialog title={task.title} onConfirm={() => handleDeleteTask(task.id)}>
                              <button
                                type="button"
                                aria-label={`Hapus pengingat ${task.title}`}
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10 flex items-center gap-1 text-sm"
                                title="Hapus Tugas"
                              >
                                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span className="hidden sm:inline">Hapus</span>
                              </button>
                            </DeleteTaskDialog>
                          </div>
                        </div>
                      </AnimatedReminderCard>
                    )
                  })
                )}
              </AnimatePresence>

              {/* Tombol Lihat Lainnya */}
              {tasks.length > 5 && !showAllTasks && (
                <motion.button
                  layout="position"
                  onClick={() => setShowAllTasks(true)}
                  className="text-cyan-400 hover:text-cyan-300 w-full py-4 text-sm font-semibold transition-colors bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 mt-2"
                >
                  Lihat {tasks.length - 5} Notifikasi Lainnya
                </motion.button>
              )}
              {showAllTasks && tasks.length > 5 && (
                <motion.button
                  layout="position"
                  onClick={() => setShowAllTasks(false)}
                  className="text-zinc-500 hover:text-zinc-300 w-full py-4 text-sm font-semibold transition-colors bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 mt-2"
                >
                  Sembunyikan
                </motion.button>
              )}
            </div>
          </LayoutGroup>
        </section>
      </main>

      <button
        type="button"
        onClick={handleOpenForm}
        aria-label="Buat pengingat"
        aria-haspopup="dialog"
        aria-controls="reminder-dialog"
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 text-white shadow-xl shadow-cyan-500/30 transition hover:brightness-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 sm:hidden"
      >
        <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <AnimatedReminderDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onAfterClose={handleFormClosed}
        busy={isSubmitting}
      >
        <div className="flex max-h-[90dvh] flex-col sm:max-h-[85dvh]">
          <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-6">
            <div>
              <h2 id="reminder-dialog-title" className="text-xl font-bold text-zinc-100">{editingTaskId ? "Edit Pengingat" : "Buat Pengingat"}</h2>
              <p id="reminder-dialog-description" className="mt-1 text-sm text-zinc-400">Atur jadwal, biar tidak lupa.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
              aria-label="Tutup form pengingat"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-50"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSaveTask} aria-busy={isSubmitting} className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <fieldset disabled={isSubmitting} className="min-w-0 space-y-4">
              <div>
                <label htmlFor="reminder-title" className="mb-1 block text-sm font-medium text-zinc-400">Judul</label>
                <input id="reminder-title" type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-zinc-100 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" placeholder="Apa yang perlu diingat?" />
              </div>
              <div>
                <label htmlFor="reminder-description" className="mb-1 block text-sm font-medium text-zinc-400">Deskripsi (Opsional)</label>
                <textarea id="reminder-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-24 w-full resize-none rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-zinc-100 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" placeholder="Isi deskripsi..." />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p id="repeat-daily-label" className="text-sm font-medium text-zinc-200">Ulangi setiap hari</p>
                  <p id="repeat-daily-description" className="mt-1 text-xs leading-relaxed text-zinc-400">Pengingat dikirim setiap hari pada jam yang kamu pilih.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.repeatDaily}
                  aria-labelledby="repeat-daily-label"
                  aria-describedby="repeat-daily-description"
                  onClick={() => setForm(current => ({ ...current, repeatDaily: !current.repeatDaily, timeZone: current.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone }))}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 ${form.repeatDaily ? 'bg-cyan-500' : 'bg-zinc-700'}`}
                >
                  <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${form.repeatDaily ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <motion.div
                initial={false}
                animate={{ gridTemplateColumns: form.repeatDaily ? "0fr 1fr" : "1fr 1fr", columnGap: form.repeatDaily ? 0 : 16 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="grid"
              >
                <motion.div initial={false} animate={{ opacity: form.repeatDaily ? 0 : 1 }} aria-hidden={form.repeatDaily} className="min-w-0 overflow-hidden">
                  <label htmlFor="reminder-date" className="mb-1 block text-sm font-medium text-zinc-400">Tanggal</label>
                  <input id="reminder-date" type="date" required={!form.repeatDaily} disabled={form.repeatDaily} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="min-w-0 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2.5 text-zinc-100 outline-none transition-colors [color-scheme:dark] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </motion.div>
                <div className="min-w-0">
                  <label htmlFor="reminder-time" className="mb-1 block text-sm font-medium text-zinc-400">Jam</label>
                  <input id="reminder-time" type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="min-w-0 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2.5 text-zinc-100 outline-none transition-colors [color-scheme:dark] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                  <AnimatePresence initial={false}>
                    {form.repeatDaily && (
                      <motion.p key="daily-timezone" initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: "auto", opacity: 1, marginTop: 8 }} exit={{ height: 0, opacity: 0, marginTop: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="overflow-hidden text-xs text-zinc-500">
                        Zona waktu: {form.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
              <button type="submit" className="mt-2 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 font-bold text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-400 hover:to-blue-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 disabled:opacity-50">
                {isSubmitting ? "Menyimpan..." : editingTaskId ? "Simpan Perubahan" : "Simpan Pengingat"}
              </button>
            </fieldset>
          </form>
        </div>
      </AnimatedReminderDialog>
    </div>
  );
}
