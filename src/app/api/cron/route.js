import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { sendDueReminders } from '@/lib/reminder-delivery.mjs';

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
    const count = await sendDueReminders(adminDb, adminMessaging);
    return NextResponse.json({ success: true, message: `Berhasil mengirim ${count} notifikasi.` });
  } catch (error) {
    console.error('Error saat menjalankan cron:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
