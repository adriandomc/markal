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

interface DragState {
  id: string;
  pointerId: number;
  startY: number;
  startIndex: number;
  currentIndex: number;
  itemRects: DOMRect[];
  handle: HTMLElement;
}

export class MarkalLegendPanel extends LitElement {
  static properties = {
    legends: { attribute: false },
    selectedLegendId: { type: String },
    embedded: { type: Boolean, reflect: true },
    _draggingId: { state: true },
  };

  legends: LegendItem[] = [];
  selectedLegendId = "";
  embedded = false;

  private dragState: DragState | null = null;
  private _draggingId: string | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(legendPanelStyles)];

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dragState) {
      this.cleanupDrag();
    }
  }

  render() {
    return html`
      <aside class="panel">
        <h3 class="panel-title">${msg("Leyenda")}</h3>
        <div class="legend-list">
          ${this.legends.map((legend, index) =>
            this.renderLegend(legend, index)
          )}
        </div>
        <button class="add-button" type="button" @click="${this.addLegend}">
          <i class="ph ph-plus"></i>
          ${msg("Nueva leyenda")}
        </button>
      </aside>
    `;
  }

  private renderLegend(legend: LegendItem, index: number) {
    const selected = legend.id === this.selectedLegendId;
    const dragging = legend.id === this._draggingId;
    const classes = ["legend-item"];
    if (selected) classes.push("selected");
    if (dragging) classes.push("dragging");

    return html`
      <section
        class="${classes.join(" ")}"
        data-index="${index}"
      >
        <div class="legend-main">
          <button
            type="button"
            class="legend-handle"
            aria-label="${msg("Mover leyenda")}"
            title="${msg("Mover leyenda")}"
            @pointerdown="${(event: PointerEvent) =>
              this.onHandlePointerDown(event, legend, index)}"
          >
            <i class="ph ph-dots-six-vertical"></i>
          </button>
          <label
            class="style-preview"
            style="${`background: ${legend.fillColor}`}"
            aria-label="${msg("Color de la leyenda")}"
            @pointerdown="${() => this.selectLegend(legend.id)}"
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
            @pointerdown="${() => this.selectLegend(legend.id)}"
            @focus="${() => this.selectLegend(legend.id)}"
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

  private onHandlePointerDown = (
    event: PointerEvent,
    legend: LegendItem,
    index: number,
  ): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();

    this.selectLegend(legend.id);

    const handle = event.currentTarget as HTMLElement;
    const items = this.getLegendItems();
    if (items.length <= 1 || index >= items.length) return;

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture can throw if the pointer is no longer active
      // (rare race). Drag still works without capture, just less robust.
    }

    this.dragState = {
      id: legend.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      startIndex: index,
      currentIndex: index,
      itemRects: items.map((el) => el.getBoundingClientRect()),
      handle,
    };

    this._draggingId = legend.id;

    handle.addEventListener("pointermove", this.onHandlePointerMove);
    handle.addEventListener("pointerup", this.onHandlePointerUp);
    handle.addEventListener("pointercancel", this.onHandlePointerCancel);
  };

  private onHandlePointerMove = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const items = this.getLegendItems();
    if (items.length !== state.itemRects.length) return;

    const deltaY = event.clientY - state.startY;
    const dragged = items[state.startIndex];
    dragged.style.transform = `translateY(${deltaY}px)`;

    const draggedRect = state.itemRects[state.startIndex];
    const draggedCenter = draggedRect.top + draggedRect.height / 2 + deltaY;

    let newIndex = state.startIndex;
    for (let i = 0; i < state.itemRects.length; i++) {
      if (i === state.startIndex) continue;
      const rect = state.itemRects[i];
      const center = rect.top + rect.height / 2;
      if (i < state.startIndex && draggedCenter < center) {
        newIndex = i;
        break;
      }
      if (i > state.startIndex && draggedCenter > center) {
        newIndex = i;
      }
    }

    if (newIndex !== state.currentIndex) {
      state.currentIndex = newIndex;
      this.applyDisplacement(items, state);
    }
  };

  private applyDisplacement(items: HTMLElement[], state: DragState): void {
    const { startIndex, currentIndex, itemRects } = state;
    for (let i = 0; i < items.length; i++) {
      if (i === startIndex) continue;
      let targetSlot = i;
      if (startIndex < currentIndex && i > startIndex && i <= currentIndex) {
        targetSlot = i - 1;
      } else if (
        startIndex > currentIndex && i < startIndex && i >= currentIndex
      ) {
        targetSlot = i + 1;
      }
      const dy = itemRects[targetSlot].top - itemRects[i].top;
      items[i].style.transform = dy ? `translateY(${dy}px)` : "";
    }
  }

  private onHandlePointerUp = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const { startIndex, currentIndex } = state;
    this.cleanupDrag();

    if (startIndex !== currentIndex) {
      const orderedIds = this.legends.map((legend) => legend.id);
      const [moved] = orderedIds.splice(startIndex, 1);
      orderedIds.splice(currentIndex, 0, moved);
      this.dispatchEvent(
        new CustomEvent<string[]>("legend-reorder", {
          detail: orderedIds,
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  private onHandlePointerCancel = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    this.cleanupDrag();
  };

  private cleanupDrag(): void {
    const state = this.dragState;
    if (!state) return;
    const items = this.getLegendItems();
    for (const item of items) {
      item.style.transform = "";
    }
    this._draggingId = null;
    const { handle, pointerId } = state;
    handle.removeEventListener("pointermove", this.onHandlePointerMove);
    handle.removeEventListener("pointerup", this.onHandlePointerUp);
    handle.removeEventListener("pointercancel", this.onHandlePointerCancel);
    try {
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore — capture may already have been released by the browser
    }
    this.dragState = null;
  }

  private getLegendItems(): HTMLElement[] {
    return Array.from(
      this.renderRoot.querySelectorAll(".legend-item"),
    ) as HTMLElement[];
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
