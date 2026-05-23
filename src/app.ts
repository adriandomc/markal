import { html, LitElement, nothing } from "lit";
import { msg, str, updateWhenLocaleChanges } from "@lit/localize";
import appStyles from "./app.scss?inline";
import {
  changeLocale as applyLocaleChange,
  getLocale,
  initLocalization,
  LOCALE_OPTIONS,
  type LocaleCode,
} from "./i18n/setup.ts";
import "./components/markal-calendar-board.ts";
import "./components/markal-calendar-item.ts";
import "./components/markal-icon-button.ts";
import "./components/markal-modal.ts";
import "./components/markal-radio-group.ts";
import "./components/markal-settings-row.ts";
import "./components/markal-switch.ts";
import "./components/markal-date-range-control.ts";
import "./components/markal-legend-panel.ts";
import type { DayMarkDetail } from "./components/markal-calendar-board.ts";
import type { LegendChangeDetail } from "./components/markal-legend-panel.ts";
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
    exportOpen: { state: true },
    loading: { state: true },
  };

  collection: CalendarCollection | null = null;
  selectedLegendId = "";
  exportMessage = "";
  sidebarOpen: boolean = this.computeInitialSidebarState();
  isMobile: boolean = this.matchesMobile();
  legendSheetOpen = false;
  infoOpen = false;
  settingsOpen = false;
  exportOpen = false;
  loading = true;

  private mobileQuery: MediaQueryList | null = null;
  private mobileListener: ((event: MediaQueryListEvent) => void) | null = null;
  private restoreFocusElement: HTMLElement | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
    void initLocalization();
  }

  private get currentLocale(): LocaleCode {
    return getLocale() as LocaleCode;
  }

  private changeLocale = (code: LocaleCode): void => {
    if (code === this.currentLocale) {
      return;
    }
    void applyLocaleChange(code);
  };

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
    void this.initStorage();
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

  private async initStorage(): Promise<void> {
    try {
      const collection = await loadCalendarCollection();
      this.collection = collection;
      this.selectedLegendId =
        getSelectedDocument(collection).legends[0]?.id ?? "";
    } finally {
      this.loading = false;
    }
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
    this.infoOpen = true;
  };

  private closeInfo = (): void => {
    this.infoOpen = false;
  };

  private openSettings = (): void => {
    this.settingsOpen = true;
  };

  private closeSettings = (): void => {
    this.settingsOpen = false;
  };

  private openExport = (): void => {
    this.exportMessage = "";
    this.exportOpen = true;
  };

  private closeExport = (): void => {
    this.exportOpen = false;
  };

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("legendSheetOpen") && this.legendSheetOpen) {
      this.focusDialog(".legend-sheet.open");
    }
  }

  private handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.exportOpen) {
      event.preventDefault();
      this.closeExport();
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
    if (this.loading || !this.collection) {
      return html`
        <div class="app-loading" role="status" aria-live="polite">
          <span>${msg("Cargando…")}</span>
        </div>
      `;
    }

    const document = this.selectedDocument;

    return html`
      <div
        class="${`sidebar-backdrop${this.sidebarOpen ? " visible" : ""}`}"
        @click="${this.closeSidebar}"
      >
      </div>
      <nav
        class="${`quick-bar${this.sidebarOpen ? " sidebar-open" : ""}`}"
        aria-label="${msg("Acciones rápidas")}"
      >
        <button
          class="${`quick-toggle${this.sidebarOpen ? " is-open" : ""}`}"
          type="button"
          aria-label="${this.sidebarOpen
            ? msg("Cerrar menú")
            : msg("Abrir menú")}"
          aria-expanded="${String(this.sidebarOpen)}"
          @click="${this.toggleSidebar}"
        >
          <i class="${this.sidebarOpen ? "ph ph-x" : "ph ph-list"}"></i>
        </button>
        <markal-icon-button
          icon="export"
          label="${msg("Exportar")}"
          size="lg"
          variant="strong"
          aria-hidden="${String(this.sidebarOpen)}"
          ?inert="${this.sidebarOpen}"
          @click="${this.openExport}"
        ></markal-icon-button>
        <markal-icon-button
          icon="gear-six"
          label="${msg("Configuración")}"
          size="lg"
          variant="strong"
          aria-hidden="${String(this.sidebarOpen)}"
          ?inert="${this.sidebarOpen}"
          @click="${this.openSettings}"
        ></markal-icon-button>
        <markal-icon-button
          icon="info"
          label="${msg("Información")}"
          size="lg"
          variant="strong"
          aria-hidden="${String(this.sidebarOpen)}"
          ?inert="${this.sidebarOpen}"
          @click="${this.openInfo}"
        ></markal-icon-button>
      </nav>
      <main class="app-shell">
        ${this.renderSidebar()}
        <div class="main-pane">
          <section class="range-row">
            <markal-date-range-control
              .range="${document.dateRange}"
              @range-change="${this.changeRange}"
            ></markal-date-range-control>
          </section>

          <section class="workspace">
            <markal-calendar-board
              .document="${document}"
              .selectedLegendId="${this.selectedLegendId}"
              @day-mark="${this.markDay}"
            ></markal-calendar-board>
            ${this.isMobile ? nothing : html`
              <markal-legend-panel
                .legends="${document.legends}"
                .selectedLegendId="${this.selectedLegendId}"
                @legend-select="${this.selectLegend}"
                @legend-change="${this.changeLegend}"
                @legend-add="${this.addLegend}"
                @legend-remove="${this.removeLegend}"
              ></markal-legend-panel>
            `}
          </section>
        </div>
      </main>
      ${this.isMobile
        ? this.renderLegendDock(document.legends)
        : nothing} ${this.renderInfoModal()} ${this.renderSettingsModal()}
      ${this.renderExportModal()}
    `;
  }

  private renderExportModal() {
    return html`
      <markal-modal
        ?open="${this.exportOpen}"
        label="${msg("Exportar calendario")}"
        size="sm"
        @markal-close="${this.closeExport}"
      >
        <p class="export-modal-hint">
          ${msg("Elige el formato en el que quieres descargar tu calendario.")}
        </p>
        <div class="export-actions">
          <button
            class="action-button"
            type="button"
            @click="${() => this.exportCalendar("png")}"
          >
            <i class="ph ph-file-png"></i>
            PNG
          </button>
          <button
            class="action-button"
            type="button"
            @click="${() => this.exportCalendar("pdf")}"
          >
            <i class="ph ph-file-pdf"></i>
            PDF
          </button>
        </div>
        <div class="export-status" role="status">${this.exportMessage}</div>
      </markal-modal>
    `;
  }

  private renderSettingsModal() {
    const settings = this.selectedDocument.settings;
    const options = Array.from(
      { length: ABSOLUTE_MAX_MARKS_PER_DAY },
      (_, index) => index + 1,
    );

    return html`
      <markal-modal
        ?open="${this.settingsOpen}"
        label="${msg("Configuración")}"
        size="lg"
        @markal-close="${this.closeSettings}"
      >
        <markal-settings-row
          rowTitle="${msg("Mostrar marcas de otros meses")}"
          helpText="${msg(
            "Visualiza las marcas en los días que se asoman desde meses adyacentes.",
          )}"
        >
          <markal-switch
            ?checked="${settings.showOutMonthMarks}"
            label="${msg("Mostrar marcas de otros meses")}"
            @change="${(event: CustomEvent<boolean>) =>
              this.updateSettings({ showOutMonthMarks: event.detail })}"
          ></markal-switch>
        </markal-settings-row>
        <markal-settings-row
          stacked
          rowTitle="${msg("Leyendas por día")}"
          helpText="${msg(
            "Máximo de leyendas que puedes apilar en una misma fecha.",
          )}"
        >
          <markal-radio-group
            .options="${options.map((value) => ({
              value,
              label: String(value),
            }))}"
            .value="${settings.maxMarksPerDay}"
            groupLabel="${msg("Leyendas por día")}"
            @markal-change="${(event: CustomEvent<number>) =>
              this.updateSettings({ maxMarksPerDay: event.detail })}"
          ></markal-radio-group>
        </markal-settings-row>
        ${this.renderLanguageRow()}
      </markal-modal>
    `;
  }

  private renderLanguageRow() {
    return html`
      <markal-settings-row
        stacked
        rowTitle="${msg("Idioma")}"
        helpText="${msg("Selecciona el idioma de la interfaz.")}"
      >
        <markal-radio-group
          .options="${LOCALE_OPTIONS.map((option) => ({
            value: option.code,
            label: option.label,
          }))}"
          .value="${this.currentLocale}"
          groupLabel="${msg("Idioma")}"
          @markal-change="${(event: CustomEvent<string>) =>
            this.changeLocale(event.detail as LocaleCode)}"
        ></markal-radio-group>
      </markal-settings-row>
    `;
  }

  private renderInfoModal() {
    return html`
      <markal-modal
        ?open="${this.infoOpen}"
        label="${msg("Acerca de Markal")}"
        @markal-close="${this.closeInfo}"
      >
        <p class="info-description">
          ${msg(
            "Markal es una herramienta para crear calendarios marcables. Sólo tienes que definir un rango de fechas, definir el color de la leyenda y ¡comenzar a marcar tu calendario!",
          )}
        </p>
        <div class="info-meta">
          <div class="info-meta-row">
            <span class="info-meta-label">${msg("Versión")}</span>
            <span class="info-meta-value">${APP_VERSION}</span>
          </div>
          <div class="info-meta-row">
            <span class="info-meta-label">${msg("Repositorio")}</span>
            <a
              class="info-link"
              href="${REPO_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >GitHub</a>
          </div>
          <div class="info-meta-row">
            <span class="info-meta-label">${msg("Changelog")}</span>
            <a
              class="info-link"
              href="${CHANGELOG_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >Releases</a>
          </div>
        </div>
        <div slot="footer" class="info-modal-footer">
          <p style="text-align:center">
            ${msg(
              html`Creado por
                <a href="https://adriandomc.com" target="_blank"
                  >Adrián Domínguez Casasola</a
                >`,
            )}
          </p>
        </div>
      </markal-modal>
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
          aria-label="${msg("Selector de leyenda")}"
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
                  aria-label="${legend.label || msg("Leyenda")}"
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
            aria-label="${msg("Editar leyendas")}"
            @click="${this.openLegendSheet}"
          >
            <i class="ph ph-pencil-simple"></i>
          </button>
        </div>
        <div
          class="${`legend-sheet${this.legendSheetOpen ? " open" : ""}`}"
          role="dialog"
          aria-label="${msg("Editor de leyendas")}"
          aria-modal="${String(this.legendSheetOpen)}"
          aria-hidden="${String(!this.legendSheetOpen)}"
          tabindex="-1"
          ?inert="${!this.legendSheetOpen}"
        >
          <header class="legend-sheet-header">
            <span class="legend-sheet-title">${msg("Leyendas")}</span>
            <markal-icon-button
              icon="x"
              label="${msg("Cerrar")}"
              @click="${this.closeLegendSheet}"
            ></markal-icon-button>
          </header>
          <div class="legend-sheet-body">
            <markal-legend-panel
              embedded
              .legends="${legends}"
              .selectedLegendId="${this.selectedLegendId}"
              @legend-select="${this.selectLegend}"
              @legend-change="${this.changeLegend}"
              @legend-add="${this.addLegend}"
              @legend-remove="${this.removeLegend}"
            ></markal-legend-panel>
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
          <span>${msg("Calendarios")}</span>
          <markal-icon-button
            icon="plus"
            label="${msg("Nuevo calendario")}"
            @click="${this.createCalendar}"
          ></markal-icon-button>
        </div>
        <div class="calendar-list">
          ${this.collection?.documents.map((calendar) =>
            this.renderCalendarItem(calendar)
          )}
        </div>
      </aside>
    `;
  }

  private renderCalendarItem(calendar: CalendarDocument) {
    const collection = this.collection;
    if (!collection) return nothing;
    const selected = calendar.id === collection.selectedId;
    return html`
      <markal-calendar-item
        .name="${calendar.title}"
        ?selected="${selected}"
        .canDelete="${collection.documents.length > 1}"
        @markal-select="${() => this.selectCalendarById(calendar.id)}"
        @markal-rename="${(event: CustomEvent<string>) =>
          this.renameCalendarById(calendar.id, event.detail)}"
        @markal-duplicate="${() => this.duplicateCalendarFromEvent(calendar.id)}"
        @markal-delete="${() => this.deleteCalendarFromEvent(calendar.id)}"
      ></markal-calendar-item>
    `;
  }

  private get selectedDocument(): CalendarDocument {
    if (!this.collection) {
      throw new Error("selectedDocument accessed before storage was ready");
    }
    return getSelectedDocument(this.collection);
  }

  private persist(collection: CalendarCollection): void {
    this.collection = collection;
    saveCalendarCollection(collection);
  }

  private updateSelectedDocument(
    updater: (document: CalendarDocument) => CalendarDocument,
  ): void {
    const collection = this.collection;
    if (!collection) return;
    const current = this.selectedDocument;
    const updated = {
      ...updater(current),
      updatedAt: new Date().toISOString(),
    };

    this.persist({
      ...collection,
      documents: collection.documents.map((
        document,
      ) => (document.id === current.id ? updated : document)),
    });
  }

  private selectCalendarById(selectedId: string): void {
    const collection = this.collection;
    if (!collection) return;
    const selected = collection.documents.find((document) =>
      document.id === selectedId
    );
    this.selectedLegendId = selected?.legends[0]?.id ?? "";
    this.persist({ ...collection, selectedId });
  }

  private renameCalendarById(id: string, title: string): void {
    const collection = this.collection;
    if (!collection) return;
    this.persist({
      ...collection,
      documents: collection.documents.map((document) =>
        document.id === id
          ? { ...document, title, updatedAt: new Date().toISOString() }
          : document
      ),
    });
  }

  private createCalendar = (): void => {
    const collection = this.collection;
    if (!collection) return;
    const nextNumber = collection.documents.length + 1;
    const document = createCalendarDocument(
      msg(str`Calendario ${nextNumber}`),
    );
    this.selectedLegendId = document.legends[0]?.id ?? "";
    this.persist({
      ...collection,
      selectedId: document.id,
      documents: [...collection.documents, document],
    });
  };

  private duplicateCalendarFromEvent(id: string): void {
    const collection = this.collection;
    if (!collection) return;
    const source = collection.documents.find((document) => document.id === id);
    if (!source) {
      return;
    }

    const document = duplicateCalendarDocument(
      source,
      msg(str`${source.title} copia`),
    );
    this.selectedLegendId = document.legends[0]?.id ?? "";
    this.persist({
      ...collection,
      selectedId: document.id,
      documents: [...collection.documents, document],
    });
  }

  private deleteCalendarFromEvent(id: string): void {
    const collection = this.collection;
    if (!collection) return;
    if (collection.documents.length <= 1) {
      return;
    }

    const target = collection.documents.find((document) => document.id === id);
    if (
      !target ||
      !globalThis.confirm(
        msg(
          str`¿Eliminar "${target.title}"? Esta acción no se puede deshacer.`,
        ),
      )
    ) {
      return;
    }

    const remaining = collection.documents.filter((document) =>
      document.id !== id
    );
    const selectedId = id === collection.selectedId
      ? remaining[0].id
      : collection.selectedId;
    const selected = remaining.find((document) => document.id === selectedId) ??
      remaining[0];
    this.selectedLegendId = selected.legends[0]?.id ?? "";
    this.persist({
      ...collection,
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
    const formatLabel = format.toUpperCase();
    this.exportMessage = msg(str`Preparando ${formatLabel}`);

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
      this.exportMessage = msg(str`${formatLabel} listo`);
    } catch (error) {
      this.exportMessage = error instanceof Error
        ? error.message
        : msg("No se pudo exportar");
    }
  };
}

customElements.define("markal-app", MarkalApp);
