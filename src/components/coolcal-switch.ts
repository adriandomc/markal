import { html, LitElement } from "lit";
import switchStyles from "./coolcal-switch.scss?inline";
import { localStyles } from "../lib/lit-styles.ts";

export class CoolcalSwitch extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
  };

  checked = false;
  disabled = false;
  label = "";

  static styles = localStyles(switchStyles);

  render() {
    return html`
      <button
        type="button"
        role="switch"
        aria-checked="${String(this.checked)}"
        aria-label="${this.label}"
        ?disabled="${this.disabled}"
        @click="${this.toggle}"
      >
        <span class="thumb"></span>
      </button>
    `;
  }

  private toggle = (): void => {
    if (this.disabled) {
      return;
    }

    this.checked = !this.checked;
    this.dispatchEvent(
      new CustomEvent<boolean>("change", {
        detail: this.checked,
        bubbles: true,
        composed: true,
      }),
    );
  };
}

customElements.define("coolcal-switch", CoolcalSwitch);
