"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Login() {
  const { user, loginWithGoogle, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-zinc-950 to-black overflow-hidden relative">
      {/* Decorative background shapes */}
      <div className="absolute top-0 left-[-10%] w-[30rem] h-[30rem] bg-purple-600/20 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-0 right-[-10%] w-[30rem] h-[30rem] bg-cyan-600/20 rounded-full blur-[100px]"></div>

      <div className="relative z-10 w-full max-w-md p-8 sm:p-10 backdrop-blur-3xl bg-white/5 rounded-3xl shadow-2xl border border-white/10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6 ring-1 ring-white/20 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-3 tracking-tight">
            NotifApp
          </h1>
          <p className="text-zinc-400 text-sm font-medium">
            Jadwalkan harimu, biarkan kami yang mengingatnya.
          </p>
        </div>

        <button 
          onClick={loginWithGoogle}
          className="w-full group flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl shadow-lg ring-1 ring-white/10 transition-all duration-300 hover:ring-white/20 hover:shadow-cyan-500/20 active:scale-[0.98]"
        >
          <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
          </svg>
          Lanjutkan dengan Google
        </button>
      </div>
    </div>
  );
}
