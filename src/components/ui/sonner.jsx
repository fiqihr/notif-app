"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      richColors
      closeButton
      duration={3500}
      offset="calc(5rem + env(safe-area-inset-top))"
      mobileOffset={{ top: "calc(5rem + env(safe-area-inset-top))", left: "1rem", right: "1rem" }}
      containerAriaLabel="Pemberitahuan"
      toastOptions={{
        closeButtonAriaLabel: "Tutup pemberitahuan",
        style: { borderRadius: "1rem", fontFamily: "var(--font-geist-sans), sans-serif" },
      }}
    />
  );
}
