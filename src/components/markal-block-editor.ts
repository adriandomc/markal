import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import blockEditorStyles from "./markal-block-editor.scss?inline";
import "./markal-modal.ts";
import type { Activity, ScheduledBlock } from "../types.ts";
import type { BlockUpdateDetail } from "./markal-time-grid.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

function minutesToTimeValue(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function timeValueToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export class MarkalBlockEditor extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    block: { attribute: false },
    activities: { attribute: false },
  };

  open = false;
  block: ScheduledBlock | null = null;
  activities: Activity[] = [];

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(blockEditorStyles)];

  render() {
    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Editar bloque")}"
        size="sm"
        @markal-close="${this.close}"
      >
        ${this.block ? this.renderBody(this.block) : nothing}
      </markal-modal>
    `;
  }

  private renderBody(block: ScheduledBlock) {
    return html`
      <div class="editor-body">
        <div class="activity-chips">
          ${this.activities.map((activity) =>
            html`
              <button
                type="button"
                class="chip ${activity.id === block.activityId
                  ? "selected"
                  : ""}"
                style="--chip-color: ${activity.fillColor}"
                @click="${() => this.patch({ activityId: activity.id })}"
              >${activity.label || msg("Actividad")}</button>
            `
          )}
        </div>
        <div class="field-row">
          <label>
            ${msg("Hora de inicio")}
            <input
              type="time"
              step="900"
              .value="${minutesToTimeValue(block.startMinutes)}"
              @change="${(e: Event) =>
                this.patch({
                  startMinutes: timeValueToMinutes(
                    (e.target as HTMLInputElement).value,
                  ),
                })}"
            />
          </label>
          <label>
            ${msg("Hora de fin")}
            <input
              type="time"
              step="900"
              .value="${minutesToTimeValue(block.endMinutes)}"
              @change="${(e: Event) =>
                this.patch({
                  endMinutes: timeValueToMinutes(
                    (e.target as HTMLInputElement).value,
                  ),
                })}"
            />
          </label>
        </div>
        <div class="field-row">
          <label>
            ${msg("Desde")}
            <input
              type="date"
              .value="${block.startDate}"
              @change="${(e: Event) =>
                this.patch({
                  startDate: (e.target as HTMLInputElement).value,
                })}"
            />
          </label>
          <label>
            ${msg("Hasta")}
            <input
              type="date"
              .value="${block.endDate}"
              @change="${(e: Event) =>
                this.patch({
                  endDate: (e.target as HTMLInputElement).value,
                })}"
            />
          </label>
        </div>
        <button
          class="delete-button"
          type="button"
          @click="${this.requestDelete}"
        >
          <i class="ph ph-trash"></i> ${msg("Eliminar bloque")}
        </button>
      </div>
    `;
  }

  private patch(patch: Partial<ScheduledBlock>): void {
    if (!this.block) return;
    this.dispatchEvent(
      new CustomEvent<BlockUpdateDetail>("block-update", {
        detail: { id: this.block.id, patch },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private requestDelete = (): void => {
    if (!this.block) return;
    this.dispatchEvent(
      new CustomEvent<string>("block-delete", {
        detail: this.block.id,
        bubbles: true,
        composed: true,
      }),
    );
    this.close();
  };

  private close = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };
}

customElements.define("markal-block-editor", MarkalBlockEditor);
