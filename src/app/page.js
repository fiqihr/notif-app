"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { messaging, db } from "@/lib/firebase";
import { getToken } from "firebase/messaging";
import { doc, updateDoc, collection, addDoc, query, where, onSnapshot, Timestamp, deleteDoc } from "firebase/firestore";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permissionStatus, setPermissionStatus] = useState("default");

  // State untuk Tugas
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", date: "", time: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

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
      // Urutkan berdasarkan waktu pembuatan terbaru (descending)
      tasksData.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.toMillis() : a.scheduledTime.toMillis();
        const timeB = b.createdAt ? b.createdAt.toMillis() : b.scheduledTime.toMillis();
        return timeB - timeA;
      });
      setTasks(tasksData);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date || !form.time) return;
    setIsSubmitting(true);
    
    try {
      // Format ke dalam Date Javascript
      const scheduledDate = new Date(`${form.date}T${form.time}:00`);
      
      await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        title: form.title,
        description: form.description,
        scheduledTime: Timestamp.fromDate(scheduledDate),
        isNotified: false,
        createdAt: Timestamp.now()
      });
      
      setForm({ title: "", description: "", date: "", time: "" });
    } catch (error) {
      console.error("Gagal menambah task", error);
      alert("Gagal menyimpan pengingat.");
    }
    setIsSubmitting(false);
  };

  const handleDeleteTask = async (taskId) => {
    if (confirm("Hapus pengingat ini?")) {
      try {
        await deleteDoc(doc(db, "tasks", taskId));
      } catch (error) {
        console.error("Gagal menghapus task", error);
        alert("Gagal menghapus pengingat.");
      }
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
                <p className="text-sm font-medium text-zinc-200">{user.name || "User"}</p>
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-zinc-100 mb-2">Halo, {user.name ? user.name.split(' ')[0] : 'Kawan'}! 👋</h2>
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

        {/* Antarmuka Task Manager (Fase 4) */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 shadow-xl backdrop-blur-md">
              <h3 className="text-xl font-bold mb-6 text-zinc-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Buat Pengingat
              </h3>
              <form onSubmit={handleAddTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Judul</label>
                  <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors text-zinc-100 outline-none" placeholder="Cth: Minum Obat" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Deskripsi (Opsional)</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors text-zinc-100 outline-none resize-none h-24" placeholder="Cth: Obat sirup 2 sendok..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Tanggal</label>
                    <input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors text-zinc-100 outline-none [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Jam</label>
                    <input type="time" required value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors text-zinc-100 outline-none [color-scheme:dark]" />
                  </div>
                </div>
                <button disabled={isSubmitting} type="submit" className="w-full mt-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98] disabled:opacity-50">
                  {isSubmitting ? "Menyimpan..." : "Simpan Pengingat"}
                </button>
              </form>
            </div>
          </div>

          {/* List */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-xl font-bold mb-6 text-zinc-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Jadwal Mendatang
            </h3>
            
            {tasks.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center h-48">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-zinc-400">Belum ada pengingat.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {(showAllTasks ? tasks : tasks.slice(0, 5)).map(task => {
                  const date = task.scheduledTime?.toDate() || new Date();
                  const isPast = date < new Date() && !task.isNotified;
                  
                  return (
                    <div key={task.id} className={`p-5 rounded-2xl border transition-all ${task.isNotified ? 'bg-zinc-900/30 border-white/5 opacity-60' : isPast ? 'bg-red-900/20 border-red-500/20' : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'} flex items-start gap-4`}>
                      <div className={`mt-1 w-10 h-10 rounded-full flex shrink-0 items-center justify-center ${task.isNotified ? 'bg-zinc-800 text-zinc-500' : 'bg-cyan-500/10 text-cyan-400'}`}>
                        {task.isNotified ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex sm:items-center sm:justify-between flex-col sm:flex-row gap-1 mb-1">
                          <h4 className={`font-bold text-lg truncate ${task.isNotified ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{task.title}</h4>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${task.isNotified ? 'bg-zinc-800 text-zinc-400' : 'bg-purple-500/20 text-purple-300'}`}>
                            {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} • {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {task.description && <p className="text-sm text-zinc-400 truncate mb-2">{task.description}</p>}
                        
                        {/* Tombol Hapus */}
                        <div className="flex justify-end mt-2">
                          <button 
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-zinc-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10 flex items-center gap-1 text-sm"
                            title="Hapus Tugas"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="hidden sm:inline">Hapus</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                
                {/* Tombol Lihat Lainnya */}
                {tasks.length > 5 && !showAllTasks && (
                  <button 
                    onClick={() => setShowAllTasks(true)} 
                    className="text-cyan-400 hover:text-cyan-300 w-full py-4 text-sm font-semibold transition-colors bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 mt-2"
                  >
                    Lihat {tasks.length - 5} Notifikasi Lainnya
                  </button>
                )}
                {showAllTasks && tasks.length > 5 && (
                  <button 
                    onClick={() => setShowAllTasks(false)} 
                    className="text-zinc-500 hover:text-zinc-300 w-full py-4 text-sm font-semibold transition-colors bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 mt-2"
                  >
                    Sembunyikan
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
