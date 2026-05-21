import { html, LitElement, nothing } from "lit";
import boardStyles from "./calendar-board.scss?inline";
import type {
  CalendarDocument,
  DateKey,
  LegendItem,
  MarkAction,
  ViewMode,
} from "../types.ts";
import {
  buildMonthGrid,
  enumerateDays,
  getAutoViewMode,
  monthsInRange,
  normalizeRange,
  parseDateKey,
  WEEKDAY_LABELS,
} from "../lib/dates.ts";
import { pickTextStyle } from "../lib/contrast.ts";
import { localStyles } from "../lib/lit-styles.ts";

export interface DayMarkDetail {
  dates: DateKey[];
  action: MarkAction;
}

export class CalendarBoard extends LitElement {
  static properties = {
    document: { attribute: false },
    selectedLegendId: { type: String },
    print: { type: Boolean, reflect: true },
    dragAction: { state: true },
  };

  document!: CalendarDocument;
  selectedLegendId = "";
  print = false;
  dragAction: MarkAction | null = null;
  private dragStartDate: DateKey | null = null;

  static styles = localStyles(boardStyles);

  disconnectedCallback(): void {
    super.disconnectedCallback();
    globalThis.removeEventListener("pointermove", this.handlePointerMove);
    globalThis.removeEventListener("pointerup", this.stopDrag);
    globalThis.removeEventListener("pointercancel", this.stopDrag);
  }

  render() {
    if (!this.document) {
      return html`
        <div class="empty-state">Sin calendario</div>
      `;
    }

    const mode = getAutoViewMode(this.document.dateRange);

    const paintMode = Boolean(this.selectedLegendId);

    return html`
      <section
        class="${paintMode ? "board paint-mode" : "board"}"
        @pointerleave="${this.stopDrag}"
      >
        <header class="board-header">
          <h2 class="title">${this.document.title}</h2>
        </header>
        ${mode === "week"
          ? this.renderWeekRange()
          : this.renderMonthRange(mode)}
      </section>
    `;
  }

  private renderWeekRange() {
    return html`
      <div class="week-range">
        ${enumerateDays(this.document.dateRange).map((date) => {
          const parsed = parseDateKey(date);
          return this.renderDay(
            date,
            parsed.getDate(),
            true,
            true,
            "week-day",
            WEEKDAY_LABELS[parsed.getDay()],
          );
        })}
      </div>
    `;
  }

  private renderMonthRange(mode: ViewMode) {
    const months = monthsInRange(this.document.dateRange);
    return html`
      <div class="months mode-${mode}">
        ${months.map((month) =>
          this.renderMonth(month.year, month.monthIndex, month.label)
        )}
      </div>
    `;
  }

  private renderMonth(year: number, monthIndex: number, label: string) {
    const cells = buildMonthGrid(year, monthIndex, this.document.dateRange);
    return html`
      <article class="month">
        <div class="month-title">${label}</div>
        <div class="weekdays">${WEEKDAY_LABELS.map((weekday) =>
          html`
            <span>${weekday}</span>
          `
        )}</div>
        <div class="day-grid">
          ${cells.map((cell) =>
            this.renderDay(
              cell.date,
              cell.day,
              cell.inMonth,
              cell.inRange,
              "",
              undefined,
            )
          )}
        </div>
      </article>
    `;
  }

  private renderDay(
    date: DateKey,
    day: number,
    inMonth: boolean,
    inRange: boolean,
    extraClass = "",
    weekday?: string,
  ) {
    const legends = this.getLegendsForDate(date, inMonth);
    const textStyle = legends.length
      ? pickTextStyle(legends.map((legend) => legend.fillColor))
      : "";
    const disabled = !inMonth || !inRange;

    return html`
      <button
        class="${[
          "day",
          extraClass,
          inMonth ? "" : "out-month",
          inRange ? "" : "out-range",
          legends.length ? "marked" : "",
        ].join(" ")}"
        style="${textStyle}"
        type="button"
        data-date="${date}"
        ?disabled="${disabled}"
        @pointerdown="${(event: PointerEvent) =>
          this.handlePointerDown(event, date)}"
      >
        ${weekday
          ? html`
            <span class="weekday">${weekday}</span>
          `
          : nothing} ${this.renderLayers(legends)}
        <span class="day-number">${inMonth ? day : ""}</span>
      </button>
    `;
  }

  private renderLayers(legends: LegendItem[]) {
    if (!legends.length) {
      return nothing;
    }

    return html`
      <span class="layers count-${legends.length}">
        ${legends.map((legend) => {
          const style = `background: ${legend.fillColor}`;
          return html`
            <span class="layer" style="${style}"></span>
          `;
        })}
      </span>
    `;
  }

  private getLegendsForDate(date: DateKey, inMonth: boolean): LegendItem[] {
    const settings = this.document.settings;
    if (!inMonth && !settings.showOutMonthMarks) {
      return [];
    }
    const ids = this.document.marks[date] ?? [];
    return ids
      .map((id) => this.document.legends.find((legend) => legend.id === id))
      .filter((legend): legend is LegendItem => Boolean(legend))
      .slice(0, settings.maxMarksPerDay);
  }

  private handlePointerDown(event: PointerEvent, date: DateKey): void {
    if (!this.selectedLegendId) {
      return;
    }

    event.preventDefault();
    const target = event.currentTarget as Element | null;
    if (
      target && "releasePointerCapture" in target &&
      target.hasPointerCapture?.(event.pointerId)
    ) {
      target.releasePointerCapture(event.pointerId);
    }
    const current = this.document.marks[date] ?? [];
    const action: MarkAction = current.includes(this.selectedLegendId)
      ? "remove"
      : "add";
    this.dragAction = action;
    this.dragStartDate = date;
    globalThis.addEventListener("pointermove", this.handlePointerMove);
    globalThis.addEventListener("pointerup", this.stopDrag, { once: true });
    globalThis.addEventListener("pointercancel", this.stopDrag, { once: true });
    this.dispatchMarkRange(date, date, action);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragAction || !this.dragStartDate) {
      return;
    }

    const root = this.shadowRoot;
    if (!root) {
      return;
    }

    const element = root.elementFromPoint(event.clientX, event.clientY);
    const dayButton = element?.closest("button.day[data-date]") as
      | HTMLButtonElement
      | null;
    if (!dayButton || dayButton.disabled) {
      return;
    }

    const date = dayButton.dataset.date as DateKey | undefined;
    if (!date) {
      return;
    }

    this.dispatchMarkRange(this.dragStartDate, date, this.dragAction);
  };

  private dispatchMarkRange(
    start: DateKey,
    end: DateKey,
    action: MarkAction,
  ): void {
    this.dispatchEvent(
      new CustomEvent<DayMarkDetail>("day-mark", {
        detail: {
          dates: enumerateDays(normalizeRange({ start, end })),
          action,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private stopDrag = (): void => {
    this.dragAction = null;
    this.dragStartDate = null;
    globalThis.removeEventListener("pointermove", this.handlePointerMove);
  };
}

customElements.define("calendar-board", CalendarBoard);
