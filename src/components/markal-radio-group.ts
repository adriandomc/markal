import { html, LitElement } from "lit";
import radioGroupStyles from "./markal-radio-group.scss?inline";
import { localStyles } from "../lib/lit-styles.ts";

export type RadioValue = string | number;

export interface RadioOption {
  value: RadioValue;
  label: string;
}

export class MarkalRadioGroup extends LitElement {
  static properties = {
    options: { attribute: false },
    value: { attribute: false },
    groupLabel: { type: String },
    columns: { type: Number },
  };

  options: RadioOption[] = [];
  value: RadioValue = "";
  groupLabel = "";
  columns = 4;

  static styles = localStyles(radioGroupStyles);

  render() {
    return html`
      <div
        class="group"
        role="radiogroup"
        aria-label="${this.groupLabel}"
        style="${`--columns: ${this.columns}`}"
      >
        ${this.options.map((option) => {
          const selected = option.value === this.value;
          return html`
            <button
              class="${`option${selected ? " selected" : ""}`}"
              type="button"
              role="radio"
              aria-checked="${String(selected)}"
              @click="${() => this.selectOption(option.value)}"
            >${option.label}</button>
          `;
        })}
      </div>
    `;
  }

  private selectOption(value: RadioValue): void {
    if (value === this.value) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<RadioValue>("markal-change", {
        detail: value,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-radio-group", MarkalRadioGroup);
