import { UPI_VPA_REGEX } from "./constants.js";
import type { Paise } from "./types.js";

export interface UpiDeepLinkParams {
  payeeVpa: string;
  payeeName: string;
  amount: Paise;
  note?: string;
}

/**
 * Build a UPI deep link URI (Android upi:// scheme).
 * Amount is converted from paise to rupees for the URI.
 */
export function buildUpiDeepLink(params: UpiDeepLinkParams): string {
  if (!UPI_VPA_REGEX.test(params.payeeVpa)) {
    throw new Error(`Invalid UPI VPA: ${params.payeeVpa}`);
  }

  if (params.amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const rupeesStr = paiseToRupeeString(params.amount);
  const note = params.note || "Chalk settlement";

  const query = new URLSearchParams({
    pa: params.payeeVpa,
    pn: params.payeeName,
    am: rupeesStr,
    cu: "INR",
    tn: note,
  });

  return `upi://pay?${query.toString()}`;
}

/**
 * App-specific deep links for iOS (where upi:// doesn't trigger a chooser).
 */
export function buildAppSpecificUpiLinks(params: UpiDeepLinkParams) {
  const base = buildUpiDeepLink(params);
  const query = base.replace("upi://pay?", "");

  return {
    generic: base,
    gpay: `gpay://upi/pay?${query}`,
    phonepe: `phonepe://pay?${query}`,
    paytm: `paytm://pay?${query}`,
  };
}

/** Convert paise (integer) to rupee string with 2 decimal places */
function paiseToRupeeString(paise: Paise): string {
  const rupees = Math.floor(paise / 100);
  const remainingPaise = paise % 100;
  return `${rupees}.${remainingPaise.toString().padStart(2, "0")}`;
}
