"use client";

import { MotionConfig } from "motion/react";

export function MotionProvider({ children }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
