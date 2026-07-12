/** Format paise as INR string, e.g. 10050 → "₹100.50" */
export function formatPaise(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const formatted = rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${paise < 0 ? "-" : ""}₹${formatted}`;
}

/** Safely extract a message string from an unknown caught value. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
