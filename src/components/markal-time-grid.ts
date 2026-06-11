import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import { getLocale } from "../i18n/setup.ts";
import timeGridStyles from "./markal-time-grid.scss?inline";
import "./markal-icon-button.ts";
import type { CalendarDocument, DateKey, ScheduledBlock } from "../types.ts";
import {
  addDays,
  compareDateKeys,
  daysBetween,
  parseDateKey,
  startOfWeek,
  todayKey,
} from "../lib/dates.ts";
import {
  blocksForDate,
  clampBlockTimes,
  formatMinutes,
  layoutDayBlocks,
  MINUTES_PER_DAY,
  snapMinutes,
} from "../lib/blocks.ts";
import { weekdayNarrowLabels } from "../lib/i18n-labels.ts";
import { pickTextStyle } from "../lib/contrast.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export interface BlockUpdateDetail {
  id: string;
  patch: Partial<ScheduledBlock>;
}

type GestureKind =
  | "create"
  | "move"
  | "resize-top"
  | "resize-bottom"
  | "resize-left"
  | "resize-right";

interface GestureState {
  kind: GestureKind;
  pointerId: number;
  isTouch: boolean;
  startX: number;
  startY: number;
  moved: boolean;
  /** Date of the column where the gesture started. */
  anchorDate: DateKey;
  /** Minutes at the start point (snapped). */
  anchorMinutes: number;
  /** Resize only: the target block and its original state. */
  blockId?: string;
  original?: ScheduledBlock;
}

const DEFAULT_FILL = "#a2c8f3";
const DEFAULT_BLOCK_MINUTES = 60;

export class MarkalTimeGrid extends LitElement {
  static properties = {
    document: { attribute: false },
    weekStart: { attribute: false },
    highlightedActivityId: { type: String },
    dragging: { type: Boolean, reflect: true },
    _draft: { state: true },
  };

  document!: CalendarDocument;
  // Controlled by the parent (app.ts owns week navigation + the last-touched
  // tracking); the grid emits `week-change` instead of mutating it.
  weekStart: DateKey = startOfWeek(todayKey());
  highlightedActivityId = "";
  dragging = false;

  private _draft: ScheduledBlock | null = null;
  private gesture: GestureState | null = null;
  private lastColumn: HTMLElement | null = null;
  private longPressTimer: ReturnType<typeof globalThis.setTimeout> | null =
    null;
  private static readonly MOUSE_DRAG_PX = 8;
  private static readonly TAP_CANCEL_PX = 10;
  private static readonly LONG_PRESS_MS = 250;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(timeGridStyles)];

  connectedCallback(): void {
    super.connectedCallback();
    // Non-passive so we can preventDefault once a drag engages — this is what
    // stops the grid body from scrolling mid-drag (mirrors the month board).
    this.addEventListener("touchmove", this.handleTouchMove, {
      passive: false,
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("touchmove", this.handleTouchMove);
    this.cleanupGesture();
  }

  private handleTouchMove = (event: TouchEvent): void => {
    if (this.gesture?.moved) {
      event.preventDefault();
    }
  };

  private get weekDates(): DateKey[] {
    return Array.from({ length: 7 }, (_, i) => addDays(this.weekStart, i));
  }

  render() {
    if (!this.document) {
      return html`<div class="empty-state">${msg("Sin calendario")}</div>`;
    }
    const dates = this.weekDates;
    const weekdays = weekdayNarrowLabels();
    const today = todayKey();
    const locale = getLocale();
    return html`
      <section class="grid-shell">
        ${this.renderNav(dates)}
        <div class="grid-scroll">
          <div class="grid-header">
            <span class="gutter-spacer"></span>
            ${dates.map((date) => {
              const parsed = parseDateKey(date);
              return html`
                <span class="day-header ${date === today ? "today" : ""}">
                  <span class="weekday">${weekdays[parsed.getDay()]}</span>
                  <span class="day-number">${parsed.getDate()}</span>
                </span>
              `;
            })}
          </div>
          <div class="grid-body">
            <div class="hour-gutter">
              ${Array.from(
                { length: 24 },
                (_, hour) =>
                  html`<span class="hour-label">
                    ${formatMinutes(hour * 60, locale)}
                  </span>`,
              )}
            </div>
            ${dates.map((date) => this.renderDayColumn(date))}
          </div>
        </div>
      </section>
    `;
  }

  private renderNav(dates: DateKey[]) {
    const locale = getLocale();
    const start = parseDateKey(dates[0]);
    const end = parseDateKey(dates[6]);
    const dayMonth = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    });
    const dayMonthYear = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    // Cross-year weeks show the year on both ends; otherwise only at the end.
    const label = start.getFullYear() === end.getFullYear()
      ? `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`
      : `${dayMonthYear.format(start)} – ${dayMonthYear.format(end)}`;
    const range = this.document.dateRange;
    return html`
      <header class="grid-nav">
        <markal-icon-button
          icon="caret-left"
          size="sm"
          label="${msg("Semana anterior")}"
          @click="${this.goToPreviousWeek}"
        ></markal-icon-button>
        <button
          class="today-button"
          type="button"
          @click="${this.goToToday}"
        >${msg("Hoy")}</button>
        <markal-icon-button
          icon="caret-right"
          size="sm"
          label="${msg("Semana siguiente")}"
          @click="${this.goToNextWeek}"
        ></markal-icon-button>
        <button
          class="week-label"
          type="button"
          title="${msg("Elegir semana")}"
          @click="${this.openWeekPicker}"
        >
          <span>${label}</span>
          <input
            class="week-picker"
            type="date"
            aria-label="${msg("Elegir semana")}"
            .value="${this.weekStart}"
            min="${range.start}"
            max="${range.end}"
            @change="${this.handleWeekPicked}"
          />
        </button>
      </header>
    `;
  }

  private renderDayColumn(date: DateKey) {
    const inRange =
      compareDateKeys(this.document.dateRange.start, date) <= 0 &&
      compareDateKeys(date, this.document.dateRange.end) <= 0;
    return html`
      <div
        class="day-column ${inRange ? "" : "out-of-range"}"
        data-date="${date}"
        @pointerdown="${(event: PointerEvent) =>
          this.handleColumnPointerDown(event, date)}"
      >
        ${layoutDayBlocks(blocksForDate(this.document.blocks, date)).map((
          item,
        ) => this.renderSegment(item.block, date, item.lane, item.laneCount))}
        ${this._draft && this._draft.startDate === date
          ? this.renderDraft(this._draft)
          : nothing}
      </div>
    `;
  }

  private renderSegment(
    block: ScheduledBlock,
    date: DateKey,
    lane: number,
    laneCount: number,
  ) {
    const activity = this.document.activities.find((a) =>
      a.id === block.activityId
    );
    if (!activity) return nothing;
    const top = (block.startMinutes / MINUTES_PER_DAY) * 100;
    const height = ((block.endMinutes - block.startMinutes) / MINUTES_PER_DAY) *
      100;
    const compact = block.endMinutes - block.startMinutes < 45;
    const highlightActive = this.highlightedActivityId !== "";
    const highlighted = highlightActive &&
      block.activityId === this.highlightedActivityId;
    const dimmed = highlightActive && !highlighted;
    const widthPct = 100 / laneCount;
    const leftPct = lane * widthPct;
    const locale = getLocale();
    return html`
      <div
        class="block-segment ${compact ? "compact" : ""} ${highlighted
          ? "highlighted"
          : ""} ${dimmed ? "dimmed" : ""}"
        data-block-id="${block.id}"
        data-date="${date}"
        style="top: ${top}%; height: ${height}%; left: calc(${leftPct}% + 2px); width: calc(${widthPct}% - 4px); background: ${activity
          .fillColor}; ${pickTextStyle([activity.fillColor])}"
        @pointerdown="${(event: PointerEvent) =>
          this.handleSegmentPointerDown(event, block, date)}"
      >
        <span class="block-label">${activity.label}</span>
        <span class="block-time">
          ${formatMinutes(block.startMinutes, locale)} –
          ${formatMinutes(block.endMinutes, locale)}
        </span>
        ${date === block.startDate
          ? html`<span class="handle handle-left" data-handle="resize-left">
          </span>`
          : nothing}
        ${date === block.endDate
          ? html`<span class="handle handle-right" data-handle="resize-right">
          </span>`
          : nothing}
        <span class="handle handle-top" data-handle="resize-top"></span>
        <span class="handle handle-bottom" data-handle="resize-bottom"></span>
      </div>
    `;
  }

  private renderDraft(draft: ScheduledBlock) {
    const activity = this.document.activities.find((a) =>
      a.id === draft.activityId
    );
    const fill = activity?.fillColor ?? DEFAULT_FILL;
    const top = (draft.startMinutes / MINUTES_PER_DAY) * 100;
    const height = ((draft.endMinutes - draft.startMinutes) / MINUTES_PER_DAY) *
      100;
    const compact = draft.endMinutes - draft.startMinutes < 45;
    const locale = getLocale();
    return html`
      <div
        class="block-segment draft ${compact ? "compact" : ""}"
        style="top: ${top}%; height: ${height}%; background: ${fill}; ${pickTextStyle(
          [fill],
        )}"
      >
        <span class="block-time">
          ${formatMinutes(draft.startMinutes, locale)} –
          ${formatMinutes(draft.endMinutes, locale)}
        </span>
      </div>
    `;
  }

  // ===== Coordinate mapping =====

  /** The day column under the pointer, or null. */
  private columnFromPoint(clientX: number, clientY: number): HTMLElement | null {
    const element = this.shadowRoot?.elementFromPoint(clientX, clientY);
    return (element?.closest(".day-column[data-date]") as HTMLElement) ?? null;
  }

  /** Convert a viewport Y into day-minutes within a column (snapped, clamped). */
  private minutesFromPoint(column: HTMLElement, clientY: number): number {
    const rect = column.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    return snapMinutes(ratio * MINUTES_PER_DAY);
  }

  // ===== Gestures =====

  private handleColumnPointerDown(event: PointerEvent, date: DateKey): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.gesture) return;
    if ((event.target as Element).closest(".block-segment")) return;

    const column = event.currentTarget as HTMLElement;
    this.beginGesture({
      kind: "create",
      event,
      column,
      anchorDate: date,
      anchorMinutes: this.minutesFromPoint(column, event.clientY),
    });
  }

  private handleSegmentPointerDown(
    event: PointerEvent,
    block: ScheduledBlock,
    date: DateKey,
  ): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.gesture) return;
    event.stopPropagation();

    const handleEl = (event.target as Element).closest(
      ".handle",
    ) as HTMLElement | null;
    const kind = (handleEl?.dataset.handle as GestureKind | undefined) ??
      "move";
    const segment = event.currentTarget as HTMLElement;
    const column = segment.closest(".day-column") as HTMLElement | null;
    this.beginGesture({
      kind,
      event,
      column: column ?? segment,
      anchorDate: date,
      anchorMinutes: column ? this.minutesFromPoint(column, event.clientY) : 0,
      blockId: block.id,
      original: block,
    });
  }

  private beginGesture(opts: {
    kind: GestureKind;
    event: PointerEvent;
    column: HTMLElement;
    anchorDate: DateKey;
    anchorMinutes: number;
    blockId?: string;
    original?: ScheduledBlock;
  }): void {
    const { event } = opts;
    this.gesture = {
      kind: opts.kind,
      pointerId: event.pointerId,
      isTouch: event.pointerType !== "mouse",
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      anchorDate: opts.anchorDate,
      anchorMinutes: opts.anchorMinutes,
      blockId: opts.blockId,
      original: opts.original,
    };
    this.lastColumn = opts.column;
    globalThis.addEventListener("pointermove", this.handlePointerMove);
    globalThis.addEventListener("pointerup", this.handlePointerUp);
    globalThis.addEventListener("pointercancel", this.handlePointerCancel);

    // Touch "create"/"move" need a long-press to tell the gesture apart from
    // scrolling; resize starts on threshold (its handles disable scroll).
    if (
      this.gesture.isTouch &&
      (opts.kind === "create" || opts.kind === "move")
    ) {
      this.longPressTimer = globalThis.setTimeout(() => {
        this.longPressTimer = null;
        this.enterDragMode();
      }, MarkalTimeGrid.LONG_PRESS_MS);
    }
  }

  private enterDragMode(): void {
    const gesture = this.gesture;
    if (!gesture || gesture.moved) return;
    gesture.moved = true;
    this.dragging = true; // reflects to host attr → CSS kills touch scroll
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // some browsers throw / disallow; ignore
      }
    }
    if (gesture.kind === "create") {
      const times = clampBlockTimes(gesture.anchorMinutes, gesture.anchorMinutes);
      this._draft = {
        id: "draft",
        activityId: "",
        startDate: gesture.anchorDate,
        endDate: gesture.anchorDate,
        ...times,
      };
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (!gesture.moved) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const dist = Math.hypot(dx, dy);

      if (
        gesture.isTouch &&
        (gesture.kind === "create" || gesture.kind === "move")
      ) {
        // Waiting for long-press; a sizeable move means the user is scrolling.
        if (dist > MarkalTimeGrid.TAP_CANCEL_PX) this.cleanupGesture();
        return;
      }

      if (dist < MarkalTimeGrid.MOUSE_DRAG_PX) return;
      this.enterDragMode();
    }

    if (!gesture.moved) return;
    this.applyGestureMove(event);
  };

  private applyGestureMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const kind = gesture.kind;

    if (kind === "create") {
      const column = this.columnFromPoint(event.clientX, event.clientY) ??
        this.lastColumn;
      if (!column) return;
      this.lastColumn = column;
      const minutes = this.minutesFromPoint(column, event.clientY);
      const times = clampBlockTimes(gesture.anchorMinutes, minutes);
      this._draft = {
        id: "draft",
        activityId: "",
        startDate: gesture.anchorDate,
        endDate: gesture.anchorDate,
        ...times,
      };
      return;
    }

    if (kind === "move") {
      // Drag the whole block, preserving its duration and day span.
      const column = this.columnFromPoint(event.clientX, event.clientY) ??
        this.lastColumn;
      if (!column) return;
      this.lastColumn = column;
      const original = gesture.original!;
      const deltaDays = daysBetween(
        gesture.anchorDate,
        column.dataset.date as DateKey,
      );
      const deltaMinutes = this.minutesFromPoint(column, event.clientY) -
        gesture.anchorMinutes;
      const duration = original.endMinutes - original.startMinutes;
      const newStart = Math.max(
        0,
        Math.min(
          snapMinutes(original.startMinutes + deltaMinutes),
          MINUTES_PER_DAY - duration,
        ),
      );
      this.dispatchUpdate(gesture.blockId!, {
        startDate: addDays(original.startDate, deltaDays),
        endDate: addDays(original.endDate, deltaDays),
        startMinutes: newStart,
        endMinutes: newStart + duration,
      });
      return;
    }

    if (kind === "resize-top" || kind === "resize-bottom") {
      // Vertical: change hours (applies to every day of the span). Any column
      // works for the Y→minutes mapping since all share the same rect.
      const column = this.columnFromPoint(event.clientX, event.clientY) ??
        this.lastColumn;
      if (!column) return;
      this.lastColumn = column;
      const minutes = this.minutesFromPoint(column, event.clientY);
      const original = gesture.original!;
      const patch = kind === "resize-top"
        ? clampBlockTimes(minutes, original.endMinutes)
        : clampBlockTimes(original.startMinutes, minutes);
      this.dispatchUpdate(gesture.blockId!, patch);
      return;
    }

    if (kind === "resize-left" || kind === "resize-right") {
      // Horizontal: grow/shrink the day span.
      const column = this.columnFromPoint(event.clientX, event.clientY);
      if (!column) return;
      const date = column.dataset.date as DateKey;
      const original = gesture.original!;
      const patch = kind === "resize-left"
        ? {
          startDate: compareDateKeys(date, original.endDate) <= 0
            ? date
            : original.endDate,
        }
        : {
          endDate: compareDateKeys(date, original.startDate) >= 0
            ? date
            : original.startDate,
        };
      this.dispatchUpdate(gesture.blockId!, patch);
    }
  }

  private handlePointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (gesture.kind === "create") {
      if (gesture.moved && this._draft) {
        const { id: _id, ...draft } = this._draft;
        this.dispatchCreate(draft);
      } else if (!gesture.moved) {
        // Tap/click: a default-length block anchored where the user pressed.
        const start = snapMinutes(gesture.anchorMinutes);
        const times = clampBlockTimes(
          start,
          Math.min(start + DEFAULT_BLOCK_MINUTES, MINUTES_PER_DAY),
        );
        this.dispatchCreate({
          activityId: "",
          startDate: gesture.anchorDate,
          endDate: gesture.anchorDate,
          ...times,
        });
      }
    } else if (gesture.kind === "move" && !gesture.moved) {
      // A press on the body that never dragged is a tap → open the editor.
      this.dispatchEdit(gesture.blockId!);
    }
    // resize/move drags dispatched live updates already; nothing to finalize.
    this.cleanupGesture();
  };

  private handlePointerCancel = (event?: PointerEvent): void => {
    if (event && this.gesture && event.pointerId !== this.gesture.pointerId) {
      return;
    }
    this.cleanupGesture();
  };

  private cleanupGesture(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.gesture = null;
    this._draft = null;
    this.lastColumn = null;
    this.dragging = false;
    globalThis.removeEventListener("pointermove", this.handlePointerMove);
    globalThis.removeEventListener("pointerup", this.handlePointerUp);
    globalThis.removeEventListener("pointercancel", this.handlePointerCancel);
  }

  private dispatchCreate(draft: Omit<ScheduledBlock, "id">): void {
    this.dispatchEvent(
      new CustomEvent<Omit<ScheduledBlock, "id">>("block-create", {
        detail: draft,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private dispatchUpdate(id: string, patch: Partial<ScheduledBlock>): void {
    this.dispatchEvent(
      new CustomEvent<BlockUpdateDetail>("block-update", {
        detail: { id, patch },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private dispatchEdit(id: string): void {
    this.dispatchEvent(
      new CustomEvent<string>("block-edit", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private dispatchWeekChange(anchorDate: DateKey): void {
    this.dispatchEvent(
      new CustomEvent<DateKey>("week-change", {
        detail: anchorDate,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private goToPreviousWeek = (): void => {
    this.dispatchWeekChange(addDays(this.weekStart, -7));
  };

  private goToNextWeek = (): void => {
    this.dispatchWeekChange(addDays(this.weekStart, 7));
  };

  private goToToday = (): void => {
    this.dispatchWeekChange(todayKey());
  };

  private openWeekPicker = (event: Event): void => {
    const input = (event.currentTarget as HTMLElement).querySelector(
      "input[type=date]",
    ) as HTMLInputElement | null;
    if (!input) return;
    // Progressive enhancement: showPicker() where supported (Chrome 99+,
    // Safari 16+, FF 101+); the overlaid input is the universal fallback.
    if ("showPicker" in input) {
      try {
        input.showPicker();
      } catch {
        // user-gesture / cross-origin restrictions — overlay still works
      }
    }
  };

  private handleWeekPicked = (event: Event): void => {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.dispatchWeekChange(value);
  };
}

customElements.define("markal-time-grid", MarkalTimeGrid);
