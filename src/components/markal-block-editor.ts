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

export interface BlockActivityChangeDetail {
  blockId: string;
  patch: Partial<Activity>;
}

export class MarkalBlockEditor extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    block: { attribute: false },
    activity: { attribute: false },
  };

  open = false;
  block: ScheduledBlock | null = null;
  /** The block's own activity (resolved by the parent), edited in place here. */
  activity: Activity | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(blockEditorStyles)];

  protected updated(changed: Map<string, unknown>): void {
    // Focus the name field when the editor opens so a freshly-created block can
    // be named immediately. Double rAF so this runs *after* markal-modal's own
    // focus pass (which otherwise lands on the dialog and steals it).
    if (changed.has("open") && this.open && this.block) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const input = this.shadowRoot?.querySelector<HTMLInputElement>(
            ".activity-name-input",
          );
          input?.focus();
          input?.select();
        })
      );
    }
  }

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
    const label = this.activity?.label ?? "";
    const fillColor = this.activity?.fillColor ?? "#a2c8f3";
    return html`
      <div class="editor-body">
        <div class="activity-field">
          <label
            class="style-preview"
            style="background: ${fillColor}"
            aria-label="${msg("Color de la actividad")}"
          >
            <input
              type="color"
              .value="${fillColor}"
              @input="${(e: Event) =>
                this.patchActivity({
                  fillColor: (e.target as HTMLInputElement).value,
                })}"
            />
          </label>
          <input
            class="activity-name-input"
            type="text"
            placeholder="${msg("Nombre de la actividad")}"
            aria-label="${msg("Nombre de la actividad")}"
            .value="${label}"
            @input="${(e: Event) =>
              this.patchActivity({
                label: (e.target as HTMLInputElement).value,
              })}"
          />
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

  private patchActivity(patch: Partial<Activity>): void {
    if (!this.block) return;
    this.dispatchEvent(
      new CustomEvent<BlockActivityChangeDetail>("block-activity-change", {
        detail: { blockId: this.block.id, patch },
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
