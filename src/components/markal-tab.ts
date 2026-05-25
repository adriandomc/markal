import { html, LitElement } from "lit";
import tabStyles from "./markal-tab.scss?inline";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalTab extends LitElement {
  static properties = {
    name: { type: String },
    label: { type: String },
    active: { type: Boolean, reflect: true },
  };

  name = "";
  label = "";
  active = false;

  static styles = localStyles(tabStyles);

  render() {
    return html`<slot></slot>`;
  }
}

customElements.define("markal-tab", MarkalTab);
