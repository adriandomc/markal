import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import modeSwitchStyles from "./markal-mode-switch.scss?inline";
import type { BoardMode } from "../types.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalModeSwitch extends LitElement {
  static properties = {
    mode: { type: String, reflect: true },
  };

  mode: BoardMode = "marks";

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(modeSwitchStyles)];

  render() {
    return html`
      <div
        class="switch-container"
        role="radiogroup"
        aria-label="${msg("Vista del calendario")}"
      >
        <button
          type="button"
          role="radio"
          aria-checked="${this.mode === "marks"}"
          aria-label="${msg("Vista de mes")}"
          title="${msg("Vista de mes")}"
          @click="${() => this.setMode("marks")}"
          class="${this.mode === "marks" ? "active" : ""}"
        >
          <i class="ph ph-calendar-blank"></i>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked="${this.mode === "schedule"}"
          aria-label="${msg("Vista de semana")}"
          title="${msg("Vista de semana")}"
          @click="${() => this.setMode("schedule")}"
          class="${this.mode === "schedule" ? "active" : ""}"
        >
          <i class="ph ph-columns"></i>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked="${this.mode === "day"}"
          aria-label="${msg("Vista de día")}"
          title="${msg("Vista de día")}"
          @click="${() => this.setMode("day")}"
          class="${this.mode === "day" ? "active" : ""}"
        >
          <i class="ph ph-sun-horizon"></i>
        </button>
      </div>
    `;
  }

  private setMode(mode: BoardMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.dispatchEvent(
      new CustomEvent<BoardMode>("mode-change", {
        detail: this.mode,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-mode-switch", MarkalModeSwitch);
