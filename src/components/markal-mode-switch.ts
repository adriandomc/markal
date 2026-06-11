import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import modeSwitchStyles from "./markal-mode-switch.scss?inline";
import type { BoardMode } from "../types.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

/**
 * Sibling of markal-switch (not a reuse): its thumb carries an icon and it
 * loads iconStyles, and its travel is driven by the reflected `mode` attribute
 * rather than `checked`. Toggles between the month board ("marks") and the
 * weekly time grid ("schedule").
 */
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
    const isSchedule = this.mode === "schedule";
    const label = isSchedule ? msg("Vista de semana") : msg("Vista de mes");
    return html`
      <button
        type="button"
        role="switch"
        aria-checked="${String(isSchedule)}"
        aria-label="${label}"
        title="${label}"
        @click="${this.toggle}"
      >
        <span class="thumb">
          <i
            class="ph ${isSchedule ? "ph-sun-horizon" : "ph-calendar-blank"}"
          ></i>
        </span>
      </button>
    `;
  }

  private toggle = (): void => {
    this.mode = this.mode === "marks" ? "schedule" : "marks";
    this.dispatchEvent(
      new CustomEvent<BoardMode>("mode-change", {
        detail: this.mode,
        bubbles: true,
        composed: true,
      }),
    );
  };
}

customElements.define("markal-mode-switch", MarkalModeSwitch);
