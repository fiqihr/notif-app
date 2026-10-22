"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

export function AnimatedReminderDialog({ open, onOpenChange, onAfterClose, busy, children }) {
  const dialogRef = useRef(null);
  const restoreScrollRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const mobile = !window.matchMedia("(min-width: 640px)").matches;
    const hidden = { opacity: 0, y: reduceMotion ? 0 : mobile ? 32 : 8, scale: reduceMotion || mobile ? 1 : 0.98 };
    let animation;
    let cancelled = false;

    if (open) {
      const wasClosed = !dialog.open;
      if (wasClosed) {
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = "hidden";
        restoreScrollRef.current = () => { document.body.style.overflow = previousOverflow; };
      }
      animation = animate(dialog, {
        opacity: wasClosed ? [0, 1] : 1,
        y: wasClosed ? [hidden.y, 0] : 0,
        scale: wasClosed ? [hidden.scale, 1] : 1,
      }, { duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] });
    } else if (dialog.open) {
      animation = animate(dialog, hidden, { duration: reduceMotion ? 0 : 0.16, ease: "easeIn" });
      animation.then(() => {
        if (cancelled) return;
        dialog.close();
        restoreScrollRef.current?.();
        restoreScrollRef.current = null;
        onAfterClose?.();
      });
    }

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [open, reduceMotion, onAfterClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      dialog?.close();
      restoreScrollRef.current?.();
      restoreScrollRef.current = null;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id="reminder-dialog"
      data-state={open ? "open" : "closed"}
      inert={!open}
      aria-labelledby="reminder-dialog-title"
      aria-describedby="reminder-dialog-description"
      onClose={() => onOpenChange(false)}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          onOpenChange(false);
        }
      }}
      className="reminder-dialog fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
    >
      {children}
    </dialog>
  );
}
