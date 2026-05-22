import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import { getLocale } from "../i18n/setup.ts";
import dateRangeStyles from "./markal-date-range-control.scss?inline";
import type { DateKey, DateRange } from "../types.ts";
import {
  buildMonthGrid,
  formatDisplayDate,
  formatMonthLabel,
  normalizeRange,
  parseDateKey,
  todayKey,
} from "../lib/dates.ts";
import { weekdayNarrowLabels } from "../lib/i18n-labels.ts";
import "./markal-icon-button.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

type ActiveField = "start" | "end";

export class MarkalDateRangeControl extends LitElement {
  static properties = {
    range: { attribute: false },
    activeField: { state: true },
    open: { state: true },
    visibleMonthKey: { state: true },
  };

  range: DateRange = { start: todayKey(), end: todayKey() };
  activeField: ActiveField = "start";
  open = false;
  visibleMonthKey = todayKey().slice(0, 7);

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(dateRangeStyles)];

  updated(changed: Map<string, unknown>): void {
    if (changed.has("range") && this.range?.start) {
      this.visibleMonthKey = this.range.start.slice(0, 7);
    }

    if (changed.has("open") && this.open) {
      requestAnimationFrame(() =>
        this.shadowRoot?.querySelector<HTMLElement>(".picker button")?.focus()
      );
    }
  }

  render() {
    const normalized = normalizeRange(this.range);
    return html`
      <div class="range-shell">
        ${this.renderChip("start", msg("Inicio"), normalized.start)}
        ${this.renderChip("end", msg("Fin"), normalized.end)}
      </div>
      ${this.open ? this.renderPicker(normalized) : nothing}
    `;
  }

  private renderChip(field: ActiveField, label: string, date: DateKey) {
    return html`
      <button
        class="date-chip"
        type="button"
        aria-expanded="${this.open && this.activeField === field
          ? "true"
          : "false"}"
        @click="${() => this.openPicker(field)}"
      >
        <span class="chip-label">${label}</span>
        <span class="chip-value">${formatDisplayDate(date, getLocale())}</span>
      </button>
    `;
  }

  private renderPicker(range: DateRange) {
    const [year, month] = this.visibleMonthKey.split("-").map(Number);
    const monthIndex = month - 1;
    const cells = buildMonthGrid(year, monthIndex, range);
    const locale = getLocale();
    const weekdays = weekdayNarrowLabels();

    return html`
      <div
        class="picker"
        role="dialog"
        aria-label="${msg("Selector de fecha")}"
        tabindex="-1"
        @keydown="${this.handlePickerKeydown}"
      >
        <div class="picker-header">
          <markal-icon-button
            icon="caret-left"
            label="${msg("Mes anterior")}"
            @click="${() => this.shiftMonth(-1)}"
          ></markal-icon-button>
          <div class="month-title">
            ${formatMonthLabel(year, monthIndex, locale)}
          </div>
          <markal-icon-button
            icon="caret-right"
            label="${msg("Mes siguiente")}"
            @click="${() => this.shiftMonth(1)}"
          ></markal-icon-button>
        </div>
        <div class="weekdays">
          ${weekdays.map((label) =>
            html`
              <span>${label}</span>
            `
          )}
        </div>
        <div class="days">
          ${cells.map((cell) => {
            const endpoint = cell.date === range.start ||
              cell.date === range.end;
            return html`
              <button
                class="${[
                  "day",
                  cell.inMonth ? "" : "out-month",
                  cell.inRange ? "in-range" : "",
                  endpoint ? "endpoint" : "",
                ].join(" ")}"
                type="button"
                @click="${() => this.selectDate(cell.date)}"
              >
                ${cell.day}
              </button>
            `;
          })}
        </div>
        <div class="picker-actions">
          <span class="active-hint">
            ${this.activeField === "start"
              ? msg("Elige inicio")
              : msg("Elige fin")}
          </span>
          <button
            class="plain-button"
            type="button"
            @click="${this.closePicker}"
          >
            ${msg("Cerrar")}
          </button>
        </div>
      </div>
    `;
  }

  private openPicker(field: ActiveField): void {
    this.activeField = field;
    this.visibleMonthKey = this.range[field].slice(0, 7);
    this.open = true;
  }

  private closePicker = (): void => {
    this.open = false;
  };

  private handlePickerKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    this.closePicker();
  };

  private shiftMonth(amount: number): void {
    const [year, month] = this.visibleMonthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + amount, 1);
    this.visibleMonthKey = `${date.getFullYear()}-${
      String(date.getMonth() + 1).padStart(2, "0")
    }`;
  }

  private selectDate(date: DateKey): void {
    const next = normalizeRange({
      ...this.range,
      [this.activeField]: date,
    });

    this.dispatchEvent(
      new CustomEvent<DateRange>("range-change", {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );

    if (this.activeField === "start") {
      this.activeField = "end";
      this.visibleMonthKey = parseDateKey(next.end).toISOString().slice(0, 7);
      return;
    }

    this.open = false;
  }
}

customElements.define("markal-date-range-control", MarkalDateRangeControl);
