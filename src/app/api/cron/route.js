import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export const maxDuration = 60; // Max 60 detik eksekusi
export const dynamic = 'force-dynamic'; // Jangan di-cache oleh Next.js

export async function GET(request) {
  // Pengamanan: Pastikan hanya dipanggil oleh Vercel Cron atau pengembang
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Akses Ditolak' }, { status: 401 });
  }

  try {
    const now = new Date();
    
    // Cari semua tugas yang belum dinotifikasi
    const tasksSnapshot = await adminDb
      .collection('tasks')
      .where('isNotified', '==', false)
      .get();

    // Lakukan filter waktu di sisi server (Javascript) untuk menghindari error Composite Index di Firestore
    const pendingTasks = tasksSnapshot.docs.filter(doc => {
      const taskTime = doc.data().scheduledTime.toDate();
      return taskTime <= now;
    });

    if (pendingTasks.length === 0) {
      return NextResponse.json({ success: true, message: 'Tidak ada pengingat yang jatuh tempo saat ini.' });
    }

    let count = 0;

    for (const taskDoc of pendingTasks) {
      const task = taskDoc.data();
      
      // Ambil FCM Token user pemilik tugas tersebut
      const userSnap = await adminDb.collection('users').doc(task.userId).get();
      if (!userSnap.exists) continue;
      
      const userData = userSnap.data();
      const fcmToken = userData.fcmToken;

      if (fcmToken) {
        // Kirim Push Notification
        const message = {
          token: fcmToken,
          notification: {
            title: `⏰ ${task.title}`,
            body: task.description || 'Waktunya mengerjakan tugasmu!',
          },
          webpush: {
            notification: {
              icon: '/favicon.ico',
              vibrate: [200, 100, 200, 100, 200, 100, 200]
            },
            fcmOptions: {
              link: '/' // Buka web saat notifikasi diklik
            }
          }
        };

        try {
          await adminMessaging.send(message);
          
          // Tandai bahwa tugas sudah dikirim agar tidak terkirim ganda
          await taskDoc.ref.update({
            isNotified: true,
            notifiedAt: new Date()
          });
          
          count++;
        } catch (err) {
          console.error(`Gagal mengirim notif ke ${task.userId}:`, err);
          // Jika token sudah tidak valid/dicabut oleh browser
          if (err.code === 'messaging/registration-token-not-registered') {
            await adminDb.collection('users').doc(task.userId).update({ fcmToken: null });
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: `Berhasil mengirim ${count} notifikasi.` });
  } catch (error) {
    console.error('Error saat menjalankan cron:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
