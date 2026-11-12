/* UPI deep-link builder (rule 6): non-custodial, money moves bank-to-bank. */
export interface UpiLink {
  href: string;
  vpa: string;
  amount: number;
}

export function buildUpiLink(vpa: string, amount: number, note: string, handle: string): UpiLink {
  const cleanVpa = vpa.trim();
  const params = new URLSearchParams({
    pa: cleanVpa,
    pn: handle || "CampusRadar Helper",
    cu: "INR",
    tn: note.slice(0, 40) || "CampusRadar tip",
  });
  if (amount > 0) params.set("am", amount.toFixed(2));
  return { href: `upi://pay?${params.toString()}`, vpa: cleanVpa, amount };
}
