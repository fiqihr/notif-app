"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteTaskDialog({ title, onConfirm, children }) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async (event) => {
    // Keep the dialog open until Firestore confirms the deletion.
    event.preventDefault();
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");

    try {
      await onConfirm();
      setOpen(false);
      toast.success("Pengingat berhasil dihapus", {
        description: `Pengingat “${title}” telah dihapus.`,
      });
    } catch (error) {
      console.warn("Gagal menghapus pengingat:", error);
      setError("Gagal menghapus pengingat. Silakan coba lagi.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isDeleting) return;
        setError("");
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent
        aria-busy={isDeleting}
        onEscapeKeyDown={(event) => {
          if (isDeleting) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <div aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/10 text-red-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <AlertDialogTitle>Hapus pengingat ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Pengingat “{title}” akan dihapus secara permanen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
            {isDeleting && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {isDeleting ? "Menghapus…" : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
