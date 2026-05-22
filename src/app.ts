import { html, LitElement, nothing } from "lit";
import appStyles from "./app.scss?inline";
import "./components/calendar-board.ts";
import "./components/markal-switch.ts";
import "./components/date-range-control.ts";
import "./components/legend-panel.ts";
import type { DayMarkDetail } from "./components/calendar-board.ts";
import type { LegendChangeDetail } from "./components/legend-panel.ts";
import type {
  CalendarCollection,
  CalendarDocument,
  CalendarSettings,
  DateRange,
  LegendItem,
} from "./types.ts";
import {
  createCalendarDocument,
  createId,
  duplicateCalendarDocument,
} from "./lib/calendar-doc.ts";
import { iconStyles } from "./lib/icon-styles.ts";
import { localStyles } from "./lib/lit-styles.ts";
import {
  ABSOLUTE_MAX_MARKS_PER_DAY,
  applyLegendToDate,
  cleanMarks,
  clampMaxMarksPerDay,
} from "./lib/marks.ts";
import {
  getSelectedDocument,
  loadCalendarCollection,
  saveCalendarCollection,
} from "./lib/storage.ts";

const SIDEBAR_STORAGE_KEY = "markal.sidebar.open";
const LEGACY_SIDEBAR_OPEN_KEY = "coolcal.sidebar.open";
const LEGACY_SIDEBAR_COLLAPSED_KEY = "coolcal.sidebar.collapsed";
const MOBILE_QUERY = "(max-width: 980px)";
const APP_VERSION = "0.1.0";
const REPO_URL = "https://github.com/adriandomc/markal";
const CHANGELOG_URL = `${REPO_URL}/releases`;

export class MarkalApp extends LitElement {
  static properties = {
    collection: { state: true },
    selectedLegendId: { state: true },
    exportMessage: { state: true },
    sidebarOpen: { state: true },
    isMobile: { state: true },
    legendSheetOpen: { state: true },
    infoOpen: { state: true },
    settingsOpen: { state: true },
  };

  collection: CalendarCollection = loadCalendarCollection();
  selectedLegendId = getSelectedDocument(this.collection).legends[0]?.id ?? "";
  exportMessage = "";
  sidebarOpen: boolean = this.computeInitialSidebarState();
  isMobile: boolean = this.matchesMobile();
  legendSheetOpen = false;
  infoOpen = false;
  settingsOpen = false;

  private mobileQuery: MediaQueryList | null = null;
  private mobileListener: ((event: MediaQueryListEvent) => void) | null = null;
  private restoreFocusElement: HTMLElement | null = null;

  private matchesMobile(): boolean {
    return typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia(MOBILE_QUERY).matches;
  }

  private readStoredPreference(): boolean | null {
    try {
      const current = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (current !== null) {
        return current === "true";
      }

      const legacyOpen = localStorage.getItem(LEGACY_SIDEBAR_OPEN_KEY);
      if (legacyOpen !== null) {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, legacyOpen);
        localStorage.removeItem(LEGACY_SIDEBAR_OPEN_KEY);
        return legacyOpen === "true";
      }

      const legacyCollapsed = localStorage.getItem(LEGACY_SIDEBAR_COLLAPSED_KEY);
      if (legacyCollapsed !== null) {
        const open = legacyCollapsed !== "true";
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
        localStorage.removeItem(LEGACY_SIDEBAR_COLLAPSED_KEY);
        return open;
      }
    } catch {
      // localStorage unavailable
    }
    return null;
  }

  private computeInitialSidebarState(): boolean {
    if (this.matchesMobile()) {
      return false;
    }

    return this.readStoredPreference() ?? true;
  }

  connectedCallback(): void {
    super.connectedCallback();
    globalThis.addEventListener("keydown", this.handleGlobalKeydown);
    if (typeof globalThis.matchMedia !== "function") {
      return;
    }

    this.mobileQuery = globalThis.matchMedia(MOBILE_QUERY);
    this.mobileListener = (event: MediaQueryListEvent) => {
      this.isMobile = event.matches;
      if (event.matches) {
        this.sidebarOpen = false;
      } else {
        this.sidebarOpen = this.readStoredPreference() ?? true;
        this.legendSheetOpen = false;
      }
    };
    this.mobileQuery.addEventListener("change", this.mobileListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.mobileQuery && this.mobileListener) {
      this.mobileQuery.removeEventListener("change", this.mobileListener);
    }
    globalThis.removeEventListener("keydown", this.handleGlobalKeydown);
  }

  private toggleSidebar = (): void => {
    this.sidebarOpen = !this.sidebarOpen;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(this.sidebarOpen));
    } catch {
      // localStorage unavailable; in-memory state still works.
    }
  };

  private closeSidebar = (): void => {
    if (!this.sidebarOpen) {
      return;
    }
    this.sidebarOpen = false;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
    } catch {
      // localStorage unavailable
    }
  };

  private openLegendSheet = (): void => {
    this.captureFocus();
    this.legendSheetOpen = true;
  };

  private closeLegendSheet = (): void => {
    this.legendSheetOpen = false;
    this.restoreFocus();
  };

  private selectLegendFromChip = (id: string): void => {
    this.selectedLegendId = id;
  };

  private openInfo = (): void => {
    this.captureFocus();
    this.infoOpen = true;
  };

  private closeInfo = (): void => {
    this.infoOpen = false;
    this.restoreFocus();
  };

  private openSettings = (): void => {
    this.captureFocus();
    if (this.isMobile) {
      this.sidebarOpen = false;
    }
    this.settingsOpen = true;
  };

  private closeSettings = (): void => {
    this.settingsOpen = false;
    this.restoreFocus();
  };

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("infoOpen") && this.infoOpen) {
      this.focusDialog(".info-modal.open");
    }

    if (changed.has("legendSheetOpen") && this.legendSheetOpen) {
      this.focusDialog(".legend-sheet.open");
    }

    if (changed.has("settingsOpen") && this.settingsOpen) {
      this.focusDialog(".settings-modal.open");
    }
  }

  private handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.settingsOpen) {
      event.preventDefault();
      this.closeSettings();
      return;
    }

    if (this.infoOpen) {
      event.preventDefault();
      this.closeInfo();
      return;
    }

    if (this.legendSheetOpen) {
      event.preventDefault();
      this.closeLegendSheet();
      return;
    }

    if (this.isMobile && this.sidebarOpen) {
      event.preventDefault();
      this.closeSidebar();
    }
  };

  private captureFocus(): void {
    const active = this.shadowRoot?.activeElement;
    this.restoreFocusElement = active instanceof HTMLElement ? active : null;
  }

  private restoreFocus(): void {
    const target = this.restoreFocusElement;
    this.restoreFocusElement = null;

    if (!target?.isConnected) {
      return;
    }

    requestAnimationFrame(() => target.focus());
  }

  private focusDialog(selector: string): void {
    requestAnimationFrame(() => {
      const dialog = this.shadowRoot?.querySelector<HTMLElement>(selector);
      const firstControl = dialog?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      (firstControl ?? dialog)?.focus();
    });
  }

  static styles = [iconStyles, localStyles(appStyles)];

  render() {
    const document = this.selectedDocument;

    return html`
      <div
        class="${`sidebar-backdrop${this.sidebarOpen ? " visible" : ""}`}"
        @click="${this.closeSidebar}"
      >
      </div>
      <button
        class="${`sidebar-toggle${this.sidebarOpen ? " is-open" : ""}`}"
        type="button"
        aria-label="${this.sidebarOpen ? "Cerrar menú" : "Abrir menú"}"
        aria-expanded="${String(this.sidebarOpen)}"
        @click="${this.toggleSidebar}"
      >
        <i class="${this.sidebarOpen ? "ph ph-x" : "ph ph-list"}"></i>
      </button>
      <button
        class="${`info-button${this.sidebarOpen ? " hidden" : ""}`}"
        type="button"
        aria-label="Información"
        title="Información"
        aria-hidden="${String(this.sidebarOpen)}"
        @click="${this.openInfo}"
      >
        <i class="ph ph-info"></i>
      </button>
      <main class="app-shell">
        ${this.renderSidebar()}
        <div class="main-pane">
          <section class="range-row">
            <date-range-control
              .range="${document.dateRange}"
              @range-change="${this.changeRange}"
            ></date-range-control>
          </section>

          <section class="workspace">
            <calendar-board
              .document="${document}"
              .selectedLegendId="${this.selectedLegendId}"
              @day-mark="${this.markDay}"
            ></calendar-board>
            ${this.isMobile ? nothing : html`
              <legend-panel
                .legends="${document.legends}"
                .selectedLegendId="${this.selectedLegendId}"
                @legend-select="${this.selectLegend}"
                @legend-change="${this.changeLegend}"
                @legend-add="${this.addLegend}"
                @legend-remove="${this.removeLegend}"
              ></legend-panel>
            `}
          </section>
        </div>
      </main>
      ${this.isMobile
        ? this.renderLegendDock(document.legends)
        : nothing} ${this.renderInfoModal()} ${this.renderSettingsModal()}
    `;
  }

  private renderSettingsModal() {
    const settings = this.selectedDocument.settings;
    const options = Array.from(
      { length: ABSOLUTE_MAX_MARKS_PER_DAY },
      (_, index) => index + 1,
    );

    return html`
      <div
        class="${`settings-backdrop${this.settingsOpen ? " visible" : ""}`}"
        @click="${this.closeSettings}"
      >
      </div>
      <div
        class="${`settings-modal${this.settingsOpen ? " open" : ""}`}"
        role="dialog"
        aria-label="Configuración"
        aria-modal="${String(this.settingsOpen)}"
        aria-hidden="${String(!this.settingsOpen)}"
        tabindex="-1"
        ?inert="${!this.settingsOpen}"
      >
        <header class="settings-modal-header">
          <span class="settings-modal-title">Configuración</span>
          <button
            class="icon-button"
            type="button"
            aria-label="Cerrar"
            @click="${this.closeSettings}"
          >
            <i class="ph ph-x"></i>
          </button>
        </header>
        <div class="settings-modal-body">
          <div class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">
                Mostrar marcas de otros meses
              </span>
              <span class="settings-row-help">
                Visualiza las marcas en los días que se asoman desde meses
                adyacentes.
              </span>
            </div>
            <markal-switch
              ?checked="${settings.showOutMonthMarks}"
              label="Mostrar marcas de otros meses"
              @change="${(event: CustomEvent<boolean>) =>
                this.updateSettings({ showOutMonthMarks: event.detail })}"
            ></markal-switch>
          </div>
          <div class="settings-row settings-row-stacked">
            <div class="settings-row-text">
              <span class="settings-row-title">Leyendas por día</span>
              <span class="settings-row-help">
                Máximo de leyendas que puedes apilar en una misma fecha.
              </span>
            </div>
            <div
              class="settings-options"
              role="radiogroup"
              aria-label="Leyendas por día"
            >
              ${options.map((value) =>
                html`
                  <button
                    class="${`settings-option${
                      settings.maxMarksPerDay === value ? " selected" : ""
                    }`}"
                    type="button"
                    role="radio"
                    aria-checked="${String(settings.maxMarksPerDay === value)}"
                    @click="${() =>
                      this.updateSettings({ maxMarksPerDay: value })}"
                  >${value}</button>
                `
              )}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderInfoModal() {
    return html`
      <div
        class="${`info-backdrop${this.infoOpen ? " visible" : ""}`}"
        @click="${this.closeInfo}"
      >
      </div>
      <div
        class="${`info-modal${this.infoOpen ? " open" : ""}`}"
        role="dialog"
        aria-label="Información de Markal"
        aria-modal="${String(this.infoOpen)}"
        aria-hidden="${String(!this.infoOpen)}"
        tabindex="-1"
        ?inert="${!this.infoOpen}"
      >
        <header class="info-modal-header">
          <span class="info-modal-title">Acerca de Markal</span>
          <button
            class="icon-button"
            type="button"
            aria-label="Cerrar"
            @click="${this.closeInfo}"
          >
            <i class="ph ph-x"></i>
          </button>
        </header>
        <div class="info-modal-body">
          <p class="info-description">
            Markal es una herramienta para crear calendarios marcables. Sólo tienes
            que definir un rango de fechas, definir el color de la leyenda y ¡comenzar
            a marcar tu calendario!
          </p>
          <div class="info-meta">
            <div class="info-meta-row">
              <span class="info-meta-label">Versión</span>
              <span class="info-meta-value">${APP_VERSION}</span>
            </div>
            <div class="info-meta-row">
              <span class="info-meta-label">Repositorio</span>
              <a
                class="info-link"
                href="${REPO_URL}"
                target="_blank"
                rel="noopener noreferrer"
              >GitHub</a>
            </div>
            <div class="info-meta-row">
              <span class="info-meta-label">Changelog</span>
              <a
                class="info-link"
                href="${CHANGELOG_URL}"
                target="_blank"
                rel="noopener noreferrer"
              >Releases</a>
            </div>
          </div>
        </div>
        <div class="info-modal-footer">
          <p style="text-align:center">Creado por <a href="https://adriandomc.com" target="_blank">Adrián Domínguez Casasola</a></p>
        </div>
      </div>
    `;
  }

  private renderLegendDock(legends: LegendItem[]) {
    return html`
      <div
        class="${`legend-backdrop${this.legendSheetOpen ? " visible" : ""}`}"
        @click="${this.closeLegendSheet}"
      >
      </div>
      <div class="legend-dock">
        <div
          class="${`legend-peek${
            this.legendSheetOpen || this.sidebarOpen ? " is-hidden" : ""
          }`}"
          role="toolbar"
          aria-label="Selector de leyenda"
          aria-hidden="${String(this.legendSheetOpen || this.sidebarOpen)}"
          ?inert="${this.legendSheetOpen || this.sidebarOpen}"
        >
          <div class="legend-chips">
            ${legends.map((legend) =>
              html`
                <button
                  class="${`legend-chip${
                    legend.id === this.selectedLegendId ? " selected" : ""
                  }`}"
                  type="button"
                  style="${`--chip-color: ${legend.fillColor}`}"
                  aria-label="${legend.label || "Leyenda"}"
                  aria-pressed="${String(
                    legend.id === this.selectedLegendId,
                  )}"
                  @click="${() => this.selectLegendFromChip(legend.id)}"
                >
                </button>
              `
            )}
          </div>
          <button
            class="legend-edit"
            type="button"
            aria-label="Editar leyendas"
            @click="${this.openLegendSheet}"
          >
            <i class="ph ph-pencil-simple"></i>
          </button>
        </div>
        <div
          class="${`legend-sheet${this.legendSheetOpen ? " open" : ""}`}"
          role="dialog"
          aria-label="Editor de leyendas"
          aria-modal="${String(this.legendSheetOpen)}"
          aria-hidden="${String(!this.legendSheetOpen)}"
          tabindex="-1"
          ?inert="${!this.legendSheetOpen}"
        >
          <header class="legend-sheet-header">
            <span class="legend-sheet-title">Leyendas</span>
            <button
              class="icon-button"
              type="button"
              aria-label="Cerrar"
              @click="${this.closeLegendSheet}"
            >
              <i class="ph ph-x"></i>
            </button>
          </header>
          <div class="legend-sheet-body">
            <legend-panel
              embedded
              .legends="${legends}"
              .selectedLegendId="${this.selectedLegendId}"
              @legend-select="${this.selectLegend}"
              @legend-change="${this.changeLegend}"
              @legend-add="${this.addLegend}"
              @legend-remove="${this.removeLegend}"
            ></legend-panel>
          </div>
        </div>
      </div>
    `;
  }

  private renderSidebar() {
    return html`
      <aside class="${`sidebar${
        this.sidebarOpen ? " open" : ""
      }`}" aria-hidden="${String(!this.sidebarOpen)}">
        <h1 class="brand">
          <i class="ph ph-calendar-dots"></i>
          Markal
        </h1>
        <div class="sidebar-section-title">
          <span>Calendarios</span>
          <button
            class="icon-button"
            type="button"
            aria-label="Nuevo calendario"
            @click="${this.createCalendar}"
          >
            <i class="ph ph-plus"></i>
          </button>
        </div>
        <div class="calendar-list">
          ${this.collection.documents.map((calendar) =>
            this.renderCalendarItem(calendar)
          )}
        </div>
        <footer class="sidebar-footer">
          <button
            class="action-button sidebar-settings"
            type="button"
            @click="${this.openSettings}"
          >
            <i class="ph ph-gear-six"></i>
            Configuración
          </button>
          <div class="status" role="status">${this.exportMessage}</div>
          <div class="export-actions">
            <button class="action-button" type="button" @click="${() =>
              this.exportCalendar("png")}">
              <i class="ph ph-file-png"></i>
              PNG
            </button>
            <button class="action-button" type="button" @click="${() =>
              this.exportCalendar("pdf")}">
              <i class="ph ph-file-pdf"></i>
              PDF
            </button>
          </div>
        </footer>
      </aside>
    `;
  }

  private renderCalendarItem(calendar: CalendarDocument) {
    const selected = calendar.id === this.collection.selectedId;
    return html`
      <article class="${selected
        ? "calendar-item selected"
        : "calendar-item"}" @click="${() =>
        this.selectCalendarById(calendar.id)}">
        <input
          class="calendar-name"
          type="text"
          aria-label="Nombre del calendario"
          .value="${calendar.title}"
          @focus="${() => this.selectCalendarById(calendar.id)}"
          @input="${(event: InputEvent) =>
            this.renameCalendarById(
              calendar.id,
              (event.target as HTMLInputElement).value,
            )}"
        />
        <button
          class="icon-button"
          type="button"
          aria-label="Duplicar calendario"
          @click="${(event: Event) =>
            this.duplicateCalendarById(event, calendar.id)}"
        >
          <i class="ph ph-copy"></i>
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="Eliminar calendario"
          ?disabled="${this.collection.documents.length <= 1}"
          @click="${(event: Event) =>
            this.deleteCalendarById(event, calendar.id)}"
        >
          <i class="ph ph-trash"></i>
        </button>
      </article>
    `;
  }

  private get selectedDocument(): CalendarDocument {
    return getSelectedDocument(this.collection);
  }

  private persist(collection: CalendarCollection): void {
    this.collection = collection;
    saveCalendarCollection(collection);
  }

  private updateSelectedDocument(
    updater: (document: CalendarDocument) => CalendarDocument,
  ): void {
    const current = this.selectedDocument;
    const updated = {
      ...updater(current),
      updatedAt: new Date().toISOString(),
    };

    this.persist({
      ...this.collection,
      documents: this.collection.documents.map((
        document,
      ) => (document.id === current.id ? updated : document)),
    });
  }

  private selectCalendarById(selectedId: string): void {
    const selected = this.collection.documents.find((document) =>
      document.id === selectedId
    );
    this.selectedLegendId = selected?.legends[0]?.id ?? "";
    this.persist({ ...this.collection, selectedId });
  }

  private renameCalendarById(id: string, title: string): void {
    this.persist({
      ...this.collection,
      documents: this.collection.documents.map((document) =>
        document.id === id
          ? { ...document, title, updatedAt: new Date().toISOString() }
          : document
      ),
    });
  }

  private createCalendar = (): void => {
    const document = createCalendarDocument(
      `Calendario ${this.collection.documents.length + 1}`,
    );
    this.selectedLegendId = document.legends[0]?.id ?? "";
    this.persist({
      ...this.collection,
      selectedId: document.id,
      documents: [...this.collection.documents, document],
    });
  };

  private duplicateCalendarById(event: Event, id: string): void {
    event.stopPropagation();
    const source = this.collection.documents.find((document) =>
      document.id === id
    );
    if (!source) {
      return;
    }

    const document = duplicateCalendarDocument(source);
    this.selectedLegendId = document.legends[0]?.id ?? "";
    this.persist({
      ...this.collection,
      selectedId: document.id,
      documents: [...this.collection.documents, document],
    });
  }

  private deleteCalendarById(event: Event, id: string): void {
    event.stopPropagation();
    if (this.collection.documents.length <= 1) {
      return;
    }

    const target = this.collection.documents.find((document) =>
      document.id === id
    );
    if (
      !target ||
      !globalThis.confirm(
        `¿Eliminar "${target.title}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    const remaining = this.collection.documents.filter((document) =>
      document.id !== id
    );
    const selectedId = id === this.collection.selectedId
      ? remaining[0].id
      : this.collection.selectedId;
    const selected = remaining.find((document) => document.id === selectedId) ??
      remaining[0];
    this.selectedLegendId = selected.legends[0]?.id ?? "";
    this.persist({
      ...this.collection,
      selectedId,
      documents: remaining,
    });
  }

  private changeRange = (event: CustomEvent<DateRange>): void => {
    this.updateSelectedDocument((document) => ({
      ...document,
      dateRange: event.detail,
    }));
  };

  private updateSettings = (patch: Partial<CalendarSettings>): void => {
    this.updateSelectedDocument((document) => ({
      ...document,
      settings: {
        ...document.settings,
        ...patch,
        maxMarksPerDay: clampMaxMarksPerDay(
          patch.maxMarksPerDay ?? document.settings.maxMarksPerDay,
        ),
      },
    }));
  };

  private selectLegend = (event: CustomEvent<string>): void => {
    this.selectedLegendId = event.detail;
  };

  private changeLegend = (event: CustomEvent<LegendChangeDetail>): void => {
    const { id, patch } = event.detail;
    this.updateSelectedDocument((document) => ({
      ...document,
      legends: document.legends.map((
        legend,
      ) => (legend.id === id ? { ...legend, ...patch } : legend)),
    }));
  };

  private addLegend = (): void => {
    const legend: LegendItem = {
      id: createId("legend"),
      label: "",
      fillColor: "#f3e4a2",
    };

    this.selectedLegendId = legend.id;
    this.updateSelectedDocument((document) => ({
      ...document,
      legends: [...document.legends, legend],
    }));
  };

  private removeLegend = (event: CustomEvent<string>): void => {
    const id = event.detail;
    const document = this.selectedDocument;

    if (document.legends.length <= 1) {
      return;
    }

    const legends = document.legends.filter((legend) => legend.id !== id);
    if (this.selectedLegendId === id) {
      this.selectedLegendId = legends[0]?.id ?? "";
    }

    this.updateSelectedDocument((current) => ({
      ...current,
      legends,
      marks: cleanMarks(
        Object.fromEntries(
          Object.entries(current.marks).map((
            [date, ids],
          ) => [date, ids.filter((markId) => markId !== id)]),
        ),
      ),
    }));
  };

  private markDay = (event: CustomEvent<DayMarkDetail>): void => {
    if (!this.selectedLegendId) {
      return;
    }

    const { dates, action } = event.detail;

    this.updateSelectedDocument((document) => {
      const marks = { ...document.marks };

      for (const date of dates) {
        marks[date] = applyLegendToDate(
          document.marks[date],
          this.selectedLegendId,
          action,
          document.settings.maxMarksPerDay,
        );
      }

      return {
        ...document,
        marks: cleanMarks(marks),
      };
    });
  };

  private exportCalendar = async (format: "png" | "pdf"): Promise<void> => {
    this.exportMessage = `Preparando ${format.toUpperCase()}`;

    try {
      const response = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document: this.selectedDocument,
          format,
          requestedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${
        this.selectedDocument.title.replace(/[^\w-]+/g, "-").toLowerCase()
      }.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.exportMessage = `${format.toUpperCase()} listo`;
    } catch (error) {
      this.exportMessage = error instanceof Error
        ? error.message
        : "No se pudo exportar";
    }
  };
}

customElements.define("markal-app", MarkalApp);
