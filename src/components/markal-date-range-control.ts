import { html, LitElement, nothing } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import { getLocale } from "../i18n/setup.ts";
import dateRangeStyles from "./markal-date-range-control.scss?inline";
import type { DateKey, DateRange } from "../types.ts";
import {
  buildMonthGrid,
  dateKeyFromParts,
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
type DatePart = "day" | "month" | "year";

interface DateBuffer {
  day: string;
  month: string;
  year: string;
}

const EMPTY_BUFFER: DateBuffer = { day: "", month: "", year: "" };

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function bufferFromKey(key: DateKey): DateBuffer {
  const d = parseDateKey(key);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: String(d.getMonth() + 1).padStart(2, "0"),
    year: String(d.getFullYear()),
  };
}

function bufferToKey(buffer: DateBuffer): DateKey | null {
  const year = parseInt(buffer.year, 10);
  const month = parseInt(buffer.month, 10);
  const day = parseInt(buffer.day, 10);
  if (!Number.isFinite(year) || year < 1) return null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(day) || day < 1) return null;
  const maxDay = daysInMonth(year, month - 1);
  const clampedDay = Math.min(day, maxDay);
  return dateKeyFromParts(year, month - 1, clampedDay);
}

export class MarkalDateRangeControl extends LitElement {
  static properties = {
    range: { attribute: false },
    activeField: { state: true },
    open: { state: true },
    visibleMonthKey: { state: true },
    _buffers: { state: true },
  };

  range: DateRange = { start: todayKey(), end: todayKey() };
  activeField: ActiveField = "start";
  open = false;
  visibleMonthKey = todayKey().slice(0, 7);
  private _buffers: Record<ActiveField, DateBuffer> = {
    start: { ...EMPTY_BUFFER },
    end: { ...EMPTY_BUFFER },
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(dateRangeStyles)];

  connectedCallback(): void {
    super.connectedCallback();
    this.syncBuffersFromRange();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has("range") && this.range?.start) {
      this.visibleMonthKey = this.range.start.slice(0, 7);
      this.syncBuffersFromRange();
    }

    if (changed.has("open") && this.open) {
      requestAnimationFrame(() =>
        this.shadowRoot?.querySelector<HTMLElement>(".picker button")?.focus()
      );
    }
  }

  private syncBuffersFromRange(): void {
    const next: Record<ActiveField, DateBuffer> = {
      start: this._buffers.start,
      end: this._buffers.end,
    };
    let mutated = false;
    for (const field of ["start", "end"] as ActiveField[]) {
      const currentKey = bufferToKey(this._buffers[field]);
      if (currentKey !== this.range[field]) {
        next[field] = bufferFromKey(this.range[field]);
        mutated = true;
      }
    }
    if (mutated) {
      this._buffers = next;
    }
  }

  render() {
    const normalized = normalizeRange(this.range);
    return html`
      <div class="range-shell">
        ${this.renderChip("start", msg("Inicio"))}
        ${this.renderChip("end", msg("Fin"))}
      </div>
      ${this.open ? this.renderPicker(normalized) : nothing}
    `;
  }

  private renderChip(field: ActiveField, label: string) {
    const buffer = this._buffers[field];
    const parts = this.getDatePartsOrder();
    const separator = this.getDateSeparator();
    const invalid = !this.isBufferComplete(buffer);

    return html`
      <div
        class="date-chip"
        data-field="${field}"
        data-invalid="${String(invalid)}"
        role="group"
        aria-label="${label}"
        aria-expanded="${this.open && this.activeField === field
          ? "true"
          : "false"}"
        @focusout="${(event: FocusEvent) =>
          this.handleChipFocusOut(event, field)}"
        @click="${(event: MouseEvent) =>
          this.handleChipClick(event, field)}"
      >
        <span class="chip-label">${label}</span>
        <div class="chip-fields">
          ${parts.map((part, index) =>
            html`
              ${index > 0
                ? html`<span class="sep">${separator}</span>`
                : nothing}
              ${this.renderPartInput(field, part, buffer)}
            `
          )}
        </div>
      </div>
    `;
  }

  private renderPartInput(
    field: ActiveField,
    part: DatePart,
    buffer: DateBuffer,
  ) {
    const ariaLabels: Record<DatePart, string> = {
      day: msg("Día"),
      month: msg("Mes"),
      year: msg("Año"),
    };
    const placeholders: Record<DatePart, string> = {
      day: "DD",
      month: "MM",
      year: "YYYY",
    };
    const maxLengths: Record<DatePart, number> = {
      day: 2,
      month: 2,
      year: 6,
    };
    const value = buffer[part];

    return html`
      <input
        class="${`num ${part}`}"
        data-field="${field}"
        data-part="${part}"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        aria-label="${ariaLabels[part]}"
        placeholder="${placeholders[part]}"
        maxlength="${maxLengths[part]}"
        .value="${value}"
        @input="${(event: InputEvent) =>
          this.handlePartInput(event, field, part)}"
        @keydown="${(event: KeyboardEvent) =>
          this.handlePartKeydown(event, field, part)}"
        @focus="${(event: FocusEvent) => {
          (event.target as HTMLInputElement).select();
        }}"
      />
    `;
  }

  private getDatePartsOrder(): DatePart[] {
    const parts = new Intl.DateTimeFormat(getLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(new Date(2000, 0, 15));
    const order: DatePart[] = [];
    for (const part of parts) {
      if (part.type === "day" || part.type === "month" || part.type === "year") {
        order.push(part.type);
      }
    }
    return order.length === 3 ? order : ["day", "month", "year"];
  }

  private getDateSeparator(): string {
    const parts = new Intl.DateTimeFormat(getLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(new Date(2000, 0, 15));
    for (const part of parts) {
      if (part.type === "literal" && /^[\/\-.\s]+$/.test(part.value)) {
        const trimmed = part.value.trim();
        if (trimmed) return trimmed;
      }
    }
    return "/";
  }

  private handlePartInput(
    event: InputEvent,
    field: ActiveField,
    part: DatePart,
  ): void {
    const input = event.target as HTMLInputElement;
    const max = part === "year" ? 6 : 2;
    let digits = input.value.replace(/\D/g, "").slice(0, max);

    // Clamp month to 01-12 and day to 01-31 (final clamp to days-in-month
    // happens on commit, so users can type "31" then change the month).
    if (part === "month" && digits.length === 2) {
      const num = parseInt(digits, 10);
      if (num > 12) digits = "12";
      if (num === 0) digits = "01";
    }
    if (part === "day" && digits.length === 2) {
      const num = parseInt(digits, 10);
      if (num > 31) digits = "31";
      if (num === 0) digits = "01";
    }

    input.value = digits;
    this._buffers = {
      ...this._buffers,
      [field]: { ...this._buffers[field], [part]: digits },
    };

    this.tryEmit(field);
    this.maybeAutoAdvance(field, part, digits);
  }

  private maybeAutoAdvance(
    field: ActiveField,
    part: DatePart,
    value: string,
  ): void {
    if (part === "year") return;

    const filled = value.length === 2;
    const firstDigitLocked = value.length === 1 &&
      ((part === "day" && parseInt(value, 10) > 3) ||
        (part === "month" && parseInt(value, 10) > 1));

    if (!filled && !firstDigitLocked) return;

    const order = this.getDatePartsOrder();
    const idx = order.indexOf(part);
    if (idx === -1 || idx >= order.length - 1) return;
    const nextPart = order[idx + 1];
    this.focusInput(field, nextPart);
  }

  private handlePartKeydown(
    event: KeyboardEvent,
    field: ActiveField,
    part: DatePart,
  ): void {
    const input = event.target as HTMLInputElement;
    const order = this.getDatePartsOrder();
    const idx = order.indexOf(part);

    if (event.key === "Backspace" && input.value === "" && idx > 0) {
      event.preventDefault();
      this.focusInput(field, order[idx - 1]);
      return;
    }

    if (event.key === "ArrowLeft" && input.selectionStart === 0 && idx > 0) {
      event.preventDefault();
      this.focusInput(field, order[idx - 1]);
      return;
    }

    if (
      event.key === "ArrowRight" &&
      input.selectionStart === input.value.length &&
      idx < order.length - 1
    ) {
      event.preventDefault();
      this.focusInput(field, order[idx + 1]);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  }

  private isBufferComplete(buffer: DateBuffer): boolean {
    if (!buffer.day || !buffer.month || !buffer.year) return false;
    if (buffer.year.length < 4) return false;
    return bufferToKey(buffer) !== null;
  }

  private handleChipFocusOut(event: FocusEvent, field: ActiveField): void {
    // focusout fires when moving between sibling inputs too; defer to a
    // microtask so the next activeElement is set, then verify focus actually
    // left this chip before normalizing.
    const chip = event.currentTarget as HTMLElement;
    queueMicrotask(() => {
      const active = this.shadowRoot?.activeElement as HTMLElement | null;
      if (active && chip.contains(active)) return;
      this.normalizeBufferOnLeave(field);
    });
  }

  private normalizeBufferOnLeave(field: ActiveField): void {
    const buffer = this._buffers[field];
    if (!this.isBufferComplete(buffer)) {
      // Incomplete or unparseable — snap back to the last good range value
      // so the chip never shows a partial date after the user moves on.
      this._buffers = {
        ...this._buffers,
        [field]: bufferFromKey(this.range[field]),
      };
      return;
    }
    // Normalize padding (e.g. "3" → "03") and reflect any day clamp
    // (e.g. typed 31 in Feb → shown as 28).
    const key = bufferToKey(buffer)!;
    const normalized = bufferFromKey(key);
    if (
      normalized.day !== buffer.day ||
      normalized.month !== buffer.month ||
      normalized.year !== buffer.year
    ) {
      this._buffers = { ...this._buffers, [field]: normalized };
    }
  }

  private focusInput(field: ActiveField, part: DatePart): void {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>(
      `input.num.${part}[data-field="${field}"]`,
    );
    if (input) {
      input.focus();
      input.select();
    }
  }

  private tryEmit(field: ActiveField): void {
    const buffer = this._buffers[field];
    // Require a complete buffer (including a 4-digit year) before emitting,
    // so partial year typing doesn't temporarily jump the calendar to
    // year 2, then 20, then 202, then 2026.
    if (!this.isBufferComplete(buffer)) return;
    const key = bufferToKey(buffer)!;
    if (key === this.range[field]) return;

    const next = normalizeRange({
      ...this.range,
      [field]: key,
    });
    this.dispatchEvent(
      new CustomEvent<DateRange>("range-change", {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );
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

  private handleChipClick(event: MouseEvent, field: ActiveField): void {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT") return;
    this.openPicker(field);
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
