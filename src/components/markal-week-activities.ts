import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import weekActivitiesStyles from "./markal-week-activities.scss?inline";
import type { Activity } from "../types.ts";
import { localStyles } from "../lib/lit-styles.ts";

/**
 * Read-only reference list of the activities present in the visible week.
 * Hovering (or tapping, on touch) a row emits `activity-hover` so the grid can
 * highlight that activity's blocks. Activities are created/edited/deleted via
 * the grid + block editor, never here.
 */
export class MarkalWeekActivities extends LitElement {
  static properties = {
    activities: { attribute: false },
    embedded: { type: Boolean, reflect: true },
  };

  activities: Activity[] = [];
  embedded = false;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = localStyles(weekActivitiesStyles);

  render() {
    return html`
      <aside class="panel">
        <h3 class="panel-title">${msg("Actividades")}</h3>
        ${this.activities.length === 0
          ? html`<p class="empty">${msg("Sin actividades esta semana")}</p>`
          : html`
            <ul
              class="activity-list"
              @mouseleave="${() => this.emitHover(null)}"
            >
              ${this.activities.map((activity) => this.renderRow(activity))}
            </ul>
          `}
      </aside>
    `;
  }

  private renderRow(activity: Activity) {
    return html`
      <li
        class="activity-row"
        tabindex="0"
        @mouseenter="${() => this.emitHover(activity.id)}"
        @focusin="${() => this.emitHover(activity.id)}"
        @focusout="${() => this.emitHover(null)}"
        @click="${() => this.emitHover(activity.id)}"
      >
        <span class="swatch" style="background: ${activity.fillColor}"></span>
        <span class="row-label ${activity.label ? "" : "muted"}">
          ${activity.label || msg("Actividad")}
        </span>
      </li>
    `;
  }

  private emitHover(id: string | null): void {
    this.dispatchEvent(
      new CustomEvent<string | null>("activity-hover", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-week-activities", MarkalWeekActivities);
