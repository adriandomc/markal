import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import calendarItemStyles from "./markal-calendar-item.scss?inline";
import "./markal-icon-button.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

interface DragState {
  pointerId: number;
  startY: number;
  startIndex: number;
  currentIndex: number;
  itemRects: DOMRect[];
  siblings: HTMLElement[];
  handle: HTMLElement;
}

export class MarkalCalendarItem extends LitElement {
  static properties = {
    name: { type: String },
    selected: { type: Boolean, reflect: true },
    canDelete: { type: Boolean },
    shared: { type: Boolean, reflect: true },
    dragging: { type: Boolean, reflect: true },
  };

  name = "";
  selected = false;
  canDelete = true;
  shared = false;
  dragging = false;

  private dragState: DragState | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
    this.addEventListener("click", this.handleHostClick);
  }

  static styles = [iconStyles, localStyles(calendarItemStyles)];

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dragState) this.cleanupDrag();
  }

  render() {
    return html`
      <button
        type="button"
        class="drag-handle"
        aria-label="${msg("Mover calendario")}"
        title="${msg("Mover calendario")}"
        @pointerdown="${this.onHandlePointerDown}"
      >
        <i class="ph ph-dots-six-vertical"></i>
      </button>
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

  private onHandlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    this.emitSelect();

    const parent = this.parentElement;
    if (!parent) return;
    const siblings = Array.from(
      parent.querySelectorAll(":scope > markal-calendar-item"),
    ) as HTMLElement[];
    const startIndex = siblings.indexOf(this);
    if (startIndex < 0 || siblings.length <= 1) return;

    const handle = event.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // pointer no longer active; drag still works without capture
    }

    this.dragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startIndex,
      currentIndex: startIndex,
      itemRects: siblings.map((el) => el.getBoundingClientRect()),
      siblings,
      handle,
    };
    this.dragging = true;

    handle.addEventListener("pointermove", this.onHandlePointerMove);
    handle.addEventListener("pointerup", this.onHandlePointerUp);
    handle.addEventListener("pointercancel", this.onHandlePointerCancel);
  };

  private onHandlePointerMove = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const deltaY = event.clientY - state.startY;
    const draggedRect = state.itemRects[state.startIndex];
    state.siblings[state.startIndex].style.transform = `translateY(${deltaY}px)`;

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
      this.applyDisplacement(state);
    }
  };

  private applyDisplacement(state: DragState): void {
    const { startIndex, currentIndex, itemRects, siblings } = state;
    for (let i = 0; i < siblings.length; i++) {
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
      siblings[i].style.transform = dy ? `translateY(${dy}px)` : "";
    }
  }

  private onHandlePointerUp = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const { startIndex, currentIndex, siblings } = state;
    this.cleanupDrag();

    if (startIndex !== currentIndex) {
      const orderedIds = siblings.map(
        (el) => (el as MarkalCalendarItem).dataset.calendarId ?? "",
      );
      const [moved] = orderedIds.splice(startIndex, 1);
      orderedIds.splice(currentIndex, 0, moved);
      this.dispatchEvent(
        new CustomEvent<string[]>("markal-reorder", {
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
    for (const sibling of state.siblings) {
      sibling.style.transform = "";
    }
    this.dragging = false;
    const { handle, pointerId } = state;
    handle.removeEventListener("pointermove", this.onHandlePointerMove);
    handle.removeEventListener("pointerup", this.onHandlePointerUp);
    handle.removeEventListener("pointercancel", this.onHandlePointerCancel);
    try {
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // already released by the browser
    }
    this.dragState = null;
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
    if (target?.closest(".drag-handle")) {
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
