import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import activityPanelStyles from "./markal-activity-panel.scss?inline";
import "./markal-icon-button.ts";
import type { Activity } from "../types.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

// Deliberate clone of markal-legend-panel (same pointer-reorder machinery and
// styles). Kept separate rather than generalized: the two panels may diverge
// and sharing risks regressions in the proven legend flow.

export interface ActivityChangeDetail {
  id: string;
  patch: Partial<Activity>;
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

export class MarkalActivityPanel extends LitElement {
  static properties = {
    activities: { attribute: false },
    selectedActivityId: { type: String },
    embedded: { type: Boolean, reflect: true },
    _draggingId: { state: true },
  };

  activities: Activity[] = [];
  selectedActivityId = "";
  embedded = false;

  private dragState: DragState | null = null;
  private _draggingId: string | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(activityPanelStyles)];

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dragState) {
      this.cleanupDrag();
    }
  }

  render() {
    return html`
      <aside class="panel">
        <h3 class="panel-title">${msg("Actividades")}</h3>
        <div class="activity-list">
          ${this.activities.map((activity, index) =>
            this.renderActivity(activity, index)
          )}
        </div>
        <button class="add-button" type="button" @click="${this.addActivity}">
          <i class="ph ph-plus"></i>
          ${msg("Nueva actividad")}
        </button>
      </aside>
    `;
  }

  private renderActivity(activity: Activity, index: number) {
    const selected = activity.id === this.selectedActivityId;
    const dragging = activity.id === this._draggingId;
    const classes = ["activity-item"];
    if (selected) classes.push("selected");
    if (dragging) classes.push("dragging");

    return html`
      <section
        class="${classes.join(" ")}"
        data-index="${index}"
      >
        <div class="activity-main">
          <button
            type="button"
            class="activity-handle"
            aria-label="${msg("Mover actividad")}"
            title="${msg("Mover actividad")}"
            @pointerdown="${(event: PointerEvent) =>
              this.onHandlePointerDown(event, activity, index)}"
          >
            <i class="ph ph-dots-six-vertical"></i>
          </button>
          <label
            class="style-preview"
            style="${`background: ${activity.fillColor}`}"
            aria-label="${msg("Color de la actividad")}"
            @pointerdown="${() => this.selectActivity(activity.id)}"
          >
            <input
              type="color"
              .value="${activity.fillColor}"
              @input="${(event: InputEvent) =>
                this.patchActivity(activity.id, {
                  fillColor: (event.target as HTMLInputElement).value,
                })}"
            />
          </label>
          <input
            class="activity-input"
            .value="${activity.label}"
            aria-label="${msg("Texto de actividad")}"
            @pointerdown="${() => this.selectActivity(activity.id)}"
            @focus="${() => this.selectActivity(activity.id)}"
            @input="${(event: InputEvent) =>
              this.patchActivity(activity.id, {
                label: (event.target as HTMLInputElement).value,
              })}"
          />
          <markal-icon-button
            icon="trash"
            size="sm"
            label="${msg("Eliminar actividad")}"
            @click="${(event: Event) =>
              this.removeActivity(event, activity.id)}"
          ></markal-icon-button>
        </div>
      </section>
    `;
  }

  private onHandlePointerDown = (
    event: PointerEvent,
    activity: Activity,
    index: number,
  ): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();

    this.selectActivity(activity.id);

    const handle = event.currentTarget as HTMLElement;
    const items = this.getActivityItems();
    if (items.length <= 1 || index >= items.length) return;

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture can throw if the pointer is no longer active
      // (rare race). Drag still works without capture, just less robust.
    }

    this.dragState = {
      id: activity.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      startIndex: index,
      currentIndex: index,
      itemRects: items.map((el) => el.getBoundingClientRect()),
      handle,
    };

    this._draggingId = activity.id;

    handle.addEventListener("pointermove", this.onHandlePointerMove);
    handle.addEventListener("pointerup", this.onHandlePointerUp);
    handle.addEventListener("pointercancel", this.onHandlePointerCancel);
  };

  private onHandlePointerMove = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const items = this.getActivityItems();
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
      const orderedIds = this.activities.map((activity) => activity.id);
      const [moved] = orderedIds.splice(startIndex, 1);
      orderedIds.splice(currentIndex, 0, moved);
      this.dispatchEvent(
        new CustomEvent<string[]>("activity-reorder", {
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
    const items = this.getActivityItems();
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

  private getActivityItems(): HTMLElement[] {
    return Array.from(
      this.renderRoot.querySelectorAll(".activity-item"),
    ) as HTMLElement[];
  }

  private selectActivity(id: string): void {
    this.dispatchEvent(
      new CustomEvent<string>("activity-select", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private patchActivity(id: string, patch: Partial<Activity>): void {
    this.dispatchEvent(
      new CustomEvent<ActivityChangeDetail>("activity-change", {
        detail: { id, patch },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private addActivity = (): void => {
    this.dispatchEvent(
      new CustomEvent("activity-add", { bubbles: true, composed: true }),
    );
  };

  private removeActivity(event: Event, id: string): void {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<string>("activity-remove", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-activity-panel", MarkalActivityPanel);
