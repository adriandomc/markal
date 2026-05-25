import { html, LitElement } from "lit";
import { updateWhenLocaleChanges } from "@lit/localize";
import tabsStyles from "./markal-tabs.scss?inline";
import "./markal-tab.ts";
import { MarkalTab } from "./markal-tab.ts";
import { localStyles } from "../lib/lit-styles.ts";

interface TabDescriptor {
  name: string;
  label: string;
}

export class MarkalTabs extends LitElement {
  static properties = {
    active: { type: String, reflect: true },
    _tabs: { state: true },
  };

  active = "";
  private _tabs: TabDescriptor[] = [];

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = localStyles(tabsStyles);

  render() {
    return html`
      <div class="tab-bar" role="tablist">
        ${this._tabs.map((tab) => {
          const isActive = tab.name === this.active;
          return html`
            <button
              class="${`tab${isActive ? " active" : ""}`}"
              type="button"
              role="tab"
              aria-selected="${String(isActive)}"
              @click="${() => this.select(tab.name)}"
            >${tab.label}</button>
          `;
        })}
      </div>
      <div class="panels">
        <slot @slotchange="${this.syncTabs}"></slot>
      </div>
    `;
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has("active")) {
      this.applyActiveToChildren();
    }
  }

  private syncTabs = (): void => {
    const slot = this.renderRoot.querySelector("slot");
    if (!slot) return;
    const assigned = slot
      .assignedElements({ flatten: true })
      .filter((el): el is MarkalTab => el instanceof MarkalTab);
    this._tabs = assigned.map((tab) => ({ name: tab.name, label: tab.label }));
    if (!this.active && this._tabs.length > 0) {
      this.active = this._tabs[0].name;
    }
    this.applyActiveToChildren(assigned);
  };

  private applyActiveToChildren(children?: MarkalTab[]): void {
    const slot = this.renderRoot.querySelector("slot");
    if (!slot) return;
    const list = children ?? slot
      .assignedElements({ flatten: true })
      .filter((el): el is MarkalTab => el instanceof MarkalTab);
    for (const child of list) {
      child.active = child.name === this.active;
    }
  }

  private select(name: string): void {
    if (name === this.active) return;
    this.active = name;
    this.dispatchEvent(
      new CustomEvent<string>("markal-tab-change", {
        detail: name,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-tabs", MarkalTabs);
