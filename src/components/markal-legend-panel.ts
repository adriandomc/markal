import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import legendPanelStyles from "./markal-legend-panel.scss?inline";
import "./markal-icon-button.ts";
import type { LegendItem } from "../types.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export interface LegendChangeDetail {
  id: string;
  patch: Partial<LegendItem>;
}

export class MarkalLegendPanel extends LitElement {
  static properties = {
    legends: { attribute: false },
    selectedLegendId: { type: String },
    embedded: { type: Boolean, reflect: true },
  };

  legends: LegendItem[] = [];
  selectedLegendId = "";
  embedded = false;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(legendPanelStyles)];

  render() {
    return html`
      <aside class="panel">
        <h3 class="panel-title">${msg("Leyenda")}</h3>
        <div class="legend-list">
          ${this.legends.map((legend) => this.renderLegend(legend))}
        </div>
        <button class="add-button" type="button" @click="${this.addLegend}">
          <i class="ph ph-plus"></i>
          ${msg("Nueva leyenda")}
        </button>
      </aside>
    `;
  }

  private renderLegend(legend: LegendItem) {
    const selected = legend.id === this.selectedLegendId;

    return html`
      <section
        class="${selected ? "legend-item selected" : "legend-item"}"
        @click="${() => this.selectLegend(legend.id)}"
      >
        <div class="legend-main">
          <label
            class="style-preview"
            style="${`background: ${legend.fillColor}`}"
            aria-label="${msg("Color de la leyenda")}"
            @click="${(event: Event) => event.stopPropagation()}"
          >
            <input
              type="color"
              .value="${legend.fillColor}"
              @input="${(event: InputEvent) =>
                this.patchLegend(legend.id, {
                  fillColor: (event.target as HTMLInputElement).value,
                })}"
            />
          </label>
          <input
            class="legend-input"
            .value="${legend.label}"
            aria-label="${msg("Texto de leyenda")}"
            @input="${(event: InputEvent) =>
              this.patchLegend(legend.id, {
                label: (event.target as HTMLInputElement).value,
              })}"
          />
          <markal-icon-button
            icon="trash"
            size="sm"
            label="${msg("Eliminar leyenda")}"
            @click="${(event: Event) => this.removeLegend(event, legend.id)}"
          ></markal-icon-button>
        </div>
      </section>
    `;
  }

  private selectLegend(id: string): void {
    this.dispatchEvent(
      new CustomEvent<string>("legend-select", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private patchLegend(id: string, patch: Partial<LegendItem>): void {
    this.dispatchEvent(
      new CustomEvent<LegendChangeDetail>("legend-change", {
        detail: { id, patch },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private addLegend = (): void => {
    this.dispatchEvent(
      new CustomEvent("legend-add", { bubbles: true, composed: true }),
    );
  };

  private removeLegend(event: Event, id: string): void {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<string>("legend-remove", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-legend-panel", MarkalLegendPanel);
