import { type CSSResult, unsafeCSS } from "lit";

export function localStyles(styles: string): CSSResult {
  return unsafeCSS(styles);
}
