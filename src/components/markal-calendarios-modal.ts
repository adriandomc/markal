import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import calendariosModalStyles from "./markal-calendarios-modal.scss?inline";
import "./markal-modal.ts";
import "./markal-icon-button.ts";
import "./markal-calendar-item.ts";
import type { CalendarDocument } from "../types.ts";
import { localStyles } from "../lib/lit-styles.ts";

export interface CalendarRenamePayload {
  id: string;
  title: string;
}

export class MarkalCalendariosModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    documents: { attribute: false },
    selectedId: { type: String },
    sharedIds: { attribute: false },
  };

  open = false;
  documents: CalendarDocument[] = [];
  selectedId = "";
  sharedIds: Set<string> = new Set();

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = localStyles(calendariosModalStyles);

  render() {
    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Calendarios")}"
        size="lg"
        @markal-close="${this.requestClose}"
      >
        <div class="calendarios-modal-header">
          <markal-icon-button
            icon="plus"
            label="${msg("Nuevo calendario")}"
            @click="${this.emitCreate}"
          ></markal-icon-button>
        </div>
        <div class="calendar-list" @markal-reorder="${this.handleReorder}">
          ${this.documents.length === 0
            ? nothing
            : this.documents.map((calendar) =>
              this.renderCalendarItem(calendar)
            )}
        </div>
      </markal-modal>
    `;
  }

  private renderCalendarItem(calendar: CalendarDocument) {
    const selected = calendar.id === this.selectedId;
    const shared = this.sharedIds.has(calendar.id);
    return html`
      <markal-calendar-item
        data-calendar-id="${calendar.id}"
        .name="${calendar.title}"
        ?selected="${selected}"
        ?shared="${shared}"
        .canDelete="${this.documents.length > 1}"
        @markal-select="${() => this.emit("calendar-select", calendar.id)}"
        @markal-rename="${(event: CustomEvent<string>) =>
          this.emit<CalendarRenamePayload>("calendar-rename", {
            id: calendar.id,
            title: event.detail,
          })}"
        @markal-duplicate="${() =>
          this.emit("calendar-duplicate", calendar.id)}"
        @markal-delete="${() => this.emit("calendar-delete", calendar.id)}"
        @markal-share="${() => this.emit("calendar-share", calendar.id)}"
      ></markal-calendar-item>
    `;
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };

  private emitCreate = (): void => {
    this.dispatchEvent(
      new CustomEvent("calendar-create", { bubbles: true, composed: true }),
    );
  };

  private handleReorder = (event: CustomEvent<string[]>): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<string[]>("calendar-reorder", {
        detail: event.detail,
        bubbles: true,
        composed: true,
      }),
    );
  };

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent<T>(type, { detail, bubbles: true, composed: true }),
    );
  }
}

customElements.define("markal-calendarios-modal", MarkalCalendariosModal);
