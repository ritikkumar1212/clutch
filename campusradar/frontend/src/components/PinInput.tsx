"use client";

/* 4-digit OTP-style PIN entry (helper side of the handshake). */
import { useRef } from "react";

export default function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (i: number, d: string) => {
    const next = value.split("");
    next[i] = d;
    onChange(next.join("").slice(0, 4));
    if (d && i < 3) refs.current[i + 1]?.focus();
  };

  return (
    <div className="flex justify-center gap-3" aria-label="Handshake PIN entry">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          className="h-14 w-12 rounded-xl border-2 border-line bg-panel2 text-center text-2xl font-black text-neon focus:border-neon focus:outline-none disabled:opacity-40"
        />
      ))}
    </div>
  );
}
