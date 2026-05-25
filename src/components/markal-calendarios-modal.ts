import { html, LitElement, nothing } from "lit";
import { msg, str, updateWhenLocaleChanges } from "@lit/localize";
import calendariosModalStyles from "./markal-calendarios-modal.scss?inline";
import "./markal-modal.ts";
import "./markal-icon-button.ts";
import "./markal-calendar-item.ts";
import type { CalendarDocument } from "../types.ts";
import type { ShareLink } from "../lib/sync/share.ts";
import { iconStyles } from "../lib/icon-styles.ts";
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
    sharingCalendarId: { type: String },
    shareLink: { attribute: false },
    shareCopied: { type: Boolean },
  };

  open = false;
  documents: CalendarDocument[] = [];
  selectedId = "";
  sharedIds: Set<string> = new Set();
  sharingCalendarId: string | null = null;
  shareLink: ShareLink | null = null;
  shareCopied = false;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(calendariosModalStyles)];

  render() {
    const sharing = this.sharingCalendarId
      ? this.documents.find((doc) => doc.id === this.sharingCalendarId) ?? null
      : null;
    const label = sharing
      ? msg(str`Compartir ${sharing.title || msg("Calendario")}`)
      : msg("Calendarios");

    return html`
      <markal-modal
        ?open="${this.open}"
        label="${label}"
        size="lg"
        @markal-close="${this.requestClose}"
      >
        ${sharing
          ? this.renderShareView(sharing)
          : this.renderListView()}
      </markal-modal>
    `;
  }

  private renderListView() {
    return html`
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

  private renderShareView(calendar: CalendarDocument) {
    return html`
      <button
        class="share-back"
        type="button"
        @click="${this.emitShareBack}"
      >
        <i class="ph ph-caret-left"></i>
        ${msg("Volver a Calendarios")}
      </button>
      <p class="share-help">
        ${msg(
          "Cualquiera con este enlace podrá ver y editar este calendario en tiempo real. Tus otros calendarios no se comparten.",
        )}
      </p>
      <div class="share-link-row">
        <input
          class="share-link-input"
          type="text"
          readonly
          .value="${this.shareLink?.url ?? ""}"
          aria-label="${msg("Enlace para compartir")}"
          @focus="${(e: FocusEvent) =>
            (e.target as HTMLInputElement).select()}"
        />
        <markal-icon-button
          icon="copy-simple"
          label="${this.shareCopied ? msg("Copiado") : msg("Copiar")}"
          @click="${this.emitShareCopy}"
        ></markal-icon-button>
      </div>
      ${this.shareCopied
        ? html`<p class="share-status">${msg("Enlace copiado")}</p>`
        : nothing}
      <p class="share-privacy">
        ${msg(
          "El cifrado de extremo a extremo viaja en el fragmento (#) del enlace, que no llega a ningún servidor.",
        )}
      </p>
      <div class="share-actions">
        <button
          class="action-button share-stop"
          type="button"
          @click="${() => this.emit("share-stop", calendar.id)}"
        >
          <i class="ph ph-link-simple"></i>
          ${msg("Dejar de compartir")}
        </button>
      </div>
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

  private emitShareBack = (): void => {
    this.dispatchEvent(
      new CustomEvent("share-back", { bubbles: true, composed: true }),
    );
  };

  private emitShareCopy = (): void => {
    this.dispatchEvent(
      new CustomEvent("share-copy", { bubbles: true, composed: true }),
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
