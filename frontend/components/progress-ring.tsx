"use client";

import { motion } from "framer-motion";

export function ProgressRing({
  percent,
  label,
  size = 144
}: {
  percent: number;
  label: string;
  size?: number;
}) {
  const normalized = Math.max(0, Math.min(percent, 100)) / 100;
  return (
    <div className="progress-ring" style={{ width: size, height: size }} aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="progress-ring-track" cx="60" cy="60" r="49" />
        <motion.circle
          className="progress-ring-value"
          cx="60"
          cy="60"
          r="49"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: normalized }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <motion.span
        key={percent.toFixed(3)}
        initial={{ opacity: 0.55, scale: 0.94, y: 2 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        {label}
      </motion.span>
    </div>
  );
}
