import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import calendarItemStyles from "./markal-calendar-item.scss?inline";
import "./markal-icon-button.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalCalendarItem extends LitElement {
  static properties = {
    name: { type: String },
    selected: { type: Boolean, reflect: true },
    canDelete: { type: Boolean },
    shared: { type: Boolean, reflect: true },
  };

  name = "";
  selected = false;
  canDelete = true;
  shared = false;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
    this.addEventListener("click", this.handleHostClick);
  }

  static styles = localStyles(calendarItemStyles);

  render() {
    return html`
      <input
        class="name"
        type="text"
        aria-label="${msg("Nombre del calendario")}"
        .value="${this.name}"
        @focus="${this.emitSelect}"
        @input="${this.handleInput}"
      />
      <markal-icon-button
        icon="share-network"
        size="sm"
        label="${this.shared ? msg("Compartiendo") : msg("Compartir")}"
        @click="${this.handleShare}"
      ></markal-icon-button>
      <markal-icon-button
        icon="copy"
        size="sm"
        label="${msg("Duplicar calendario")}"
        @click="${this.handleDuplicate}"
      ></markal-icon-button>
      <markal-icon-button
        icon="trash"
        size="sm"
        label="${msg("Eliminar calendario")}"
        ?disabled="${!this.canDelete}"
        @click="${this.handleDelete}"
      ></markal-icon-button>
    `;
  }

  private handleShare = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("markal-share", { bubbles: true, composed: true }),
    );
  };

  private handleHostClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.closest("markal-icon-button")) {
      return;
    }
    this.emitSelect();
  };

  private emitSelect = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-select", { bubbles: true, composed: true }),
    );
  };

  private handleInput = (event: InputEvent): void => {
    const value = (event.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent<string>("markal-rename", {
        detail: value,
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleDuplicate = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("markal-duplicate", { bubbles: true, composed: true }),
    );
  };

  private handleDelete = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("markal-delete", { bubbles: true, composed: true }),
    );
  };
}

customElements.define("markal-calendar-item", MarkalCalendarItem);
