import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import modalStyles from "./markal-modal.scss?inline";
import "./markal-icon-button.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    label: { type: String },
    size: { type: String, reflect: true },
  };

  open = false;
  label = "";
  size: "sm" | "md" | "lg" = "md";

  private previousFocus: HTMLElement | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = localStyles(modalStyles);

  updated(changed: Map<string, unknown>): void {
    if (!changed.has("open")) {
      return;
    }

    if (this.open) {
      const root = this.getRootNode();
      const active = root instanceof ShadowRoot || root instanceof Document
        ? root.activeElement
        : null;
      this.previousFocus = active instanceof HTMLElement ? active : null;

      requestAnimationFrame(() => {
        const dialog = this.shadowRoot?.querySelector<HTMLElement>(".dialog");
        const focusable = dialog?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        (focusable ?? dialog)?.focus();
      });
      return;
    }

    const target = this.previousFocus;
    this.previousFocus = null;
    if (target?.isConnected) {
      requestAnimationFrame(() => target.focus());
    }
  }

  render() {
    return html`
      <div class="backdrop" @click="${this.requestClose}"></div>
      <div
        class="dialog"
        role="dialog"
        aria-label="${this.label}"
        aria-modal="${String(this.open)}"
        aria-hidden="${String(!this.open)}"
        tabindex="-1"
        ?inert="${!this.open}"
      >
        <header class="header">
          <span class="title">${this.label}</span>
          <markal-icon-button
            icon="x"
            label="${msg("Cerrar")}"
            @click="${this.requestClose}"
          ></markal-icon-button>
        </header>
        <div class="body"><slot></slot></div>
        <slot name="footer"></slot>
      </div>
    `;
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };
}

customElements.define("markal-modal", MarkalModal);
