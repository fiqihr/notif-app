"use client";

import { motion, useIsPresent } from "motion/react";

export function AnimatedReminderCard({ ref, finished, className, children }) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      ref={ref}
      layout="position"
      inert={!isPresent}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: finished ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        duration: 0.18,
        layout: { type: "spring", stiffness: 440, damping: 38, mass: 0.85 },
      }}
      style={{ borderRadius: "1rem" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
