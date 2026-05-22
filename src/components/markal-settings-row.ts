import { html, LitElement } from "lit";
import settingsRowStyles from "./markal-settings-row.scss?inline";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalSettingsRow extends LitElement {
  static properties = {
    rowTitle: { type: String },
    helpText: { type: String },
    stacked: { type: Boolean, reflect: true },
  };

  rowTitle = "";
  helpText = "";
  stacked = false;

  static styles = localStyles(settingsRowStyles);

  render() {
    return html`
      <div class="row">
        <div class="text">
          <span class="title">${this.rowTitle}</span>
          <span class="help">${this.helpText}</span>
        </div>
        <slot></slot>
      </div>
    `;
  }
}

customElements.define("markal-settings-row", MarkalSettingsRow);
