import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import exportModalStyles from "./markal-export-modal.scss?inline";
import "./markal-modal.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export type ExportFormat = "png" | "pdf";

export class MarkalExportModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    exportMessage: { type: String },
  };

  open = false;
  exportMessage = "";

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(exportModalStyles)];

  render() {
    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Exportar calendario")}"
        size="sm"
        @markal-close="${this.requestClose}"
      >
        <p class="export-modal-hint">
          ${msg("Elige el formato en el que quieres descargar tu calendario.")}
        </p>
        <div class="export-actions">
          <button
            class="action-button"
            type="button"
            @click="${() => this.emitFormat("png")}"
          >
            <i class="ph ph-file-png"></i>
            PNG
          </button>
          <button
            class="action-button"
            type="button"
            @click="${() => this.emitFormat("pdf")}"
          >
            <i class="ph ph-file-pdf"></i>
            PDF
          </button>
        </div>
        <div class="export-status" role="status">${this.exportMessage}</div>
      </markal-modal>
    `;
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };

  private emitFormat(format: ExportFormat): void {
    this.dispatchEvent(
      new CustomEvent<ExportFormat>("export-format", {
        detail: format,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-export-modal", MarkalExportModal);
