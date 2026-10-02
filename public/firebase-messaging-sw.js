importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCYf5Mk_W3_FysaFTrXGv8zD29ig7lLyow",
  authDomain: "notification-app-142ac.firebaseapp.com",
  projectId: "notification-app-142ac",
  storageBucket: "notification-app-142ac.firebasestorage.app",
  messagingSenderId: "918025891628",
  appId: "1:918025891628:web:b2a1a9e7bd16f4a1ddc689"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Menerima pesan di background ', payload);
  // HAPUS showNotification manual di sini.
  // Karena payload dari server sudah memiliki objek "notification", 
  // Firebase SDK akan secara OTOMATIS menampilkannya ke layar.
  // Jika kita panggil showNotification lagi, maka akan muncul 2x!
});
