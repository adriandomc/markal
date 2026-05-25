import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import shareModalStyles from "./markal-share-modal.scss?inline";
import "./markal-modal.ts";
import "./markal-icon-button.ts";
import type { ShareLink } from "../lib/sync/share.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalShareModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    shareLink: { attribute: false },
    shareCopied: { type: Boolean },
    currentCalendarId: { type: String },
  };

  open = false;
  shareLink: ShareLink | null = null;
  shareCopied = false;
  currentCalendarId: string | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(shareModalStyles)];

  render() {
    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Compartir calendario")}"
        size="md"
        @markal-close="${this.requestClose}"
      >
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
            @click="${this.emitCopy}"
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
        ${this.currentCalendarId
          ? html`
            <div class="share-actions">
              <button
                class="action-button share-stop"
                type="button"
                @click="${this.emitStop}"
              >
                <i class="ph ph-link-simple"></i>
                ${msg("Dejar de compartir")}
              </button>
            </div>
          `
          : nothing}
      </markal-modal>
    `;
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };

  private emitCopy = (): void => {
    this.dispatchEvent(
      new CustomEvent("share-copy", { bubbles: true, composed: true }),
    );
  };

  private emitStop = (): void => {
    if (!this.currentCalendarId) return;
    this.dispatchEvent(
      new CustomEvent<string>("share-stop", {
        detail: this.currentCalendarId,
        bubbles: true,
        composed: true,
      }),
    );
  };
}

customElements.define("markal-share-modal", MarkalShareModal);
