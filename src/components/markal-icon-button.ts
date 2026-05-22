import { html, LitElement } from "lit";
import iconButtonStyles from "./markal-icon-button.scss?inline";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalIconButton extends LitElement {
  static properties = {
    icon: { type: String },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
    size: { type: String, reflect: true },
    variant: { type: String, reflect: true },
  };

  icon = "";
  label = "";
  disabled = false;
  size: "sm" | "md" | "lg" = "md";
  variant: "default" | "strong" = "default";

  static styles = [iconStyles, localStyles(iconButtonStyles)];

  render() {
    return html`
      <button
        type="button"
        aria-label="${this.label}"
        title="${this.label}"
        ?disabled="${this.disabled}"
      >
        <i class="${`ph ph-${this.icon}`}"></i>
      </button>
    `;
  }
}

customElements.define("markal-icon-button", MarkalIconButton);
