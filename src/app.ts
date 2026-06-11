import { html, LitElement, nothing } from "lit";
import { msg, str, updateWhenLocaleChanges } from "@lit/localize";
import appStyles from "./app.scss?inline";
import {
  changeLocale as applyLocaleChange,
  getLocale,
  initLocalization,
  type LocaleCode,
} from "./i18n/setup.ts";
import "./components/markal-calendar-board.ts";
import "./components/markal-icon-button.ts";
import "./components/markal-date-range-control.ts";
import "./components/markal-legend-panel.ts";
import "./components/markal-mode-switch.ts";
import "./components/markal-time-grid.ts";
import "./components/markal-activity-panel.ts";
import "./components/markal-block-editor.ts";
import "./components/markal-settings-modal.ts";
import "./components/markal-info-modal.ts";
import "./components/markal-export-modal.ts";
import "./components/markal-calendarios-modal.ts";
import "./components/markal-peers-modal.ts";
import type { DayMarkDetail } from "./components/markal-calendar-board.ts";
import type { LegendChangeDetail } from "./components/markal-legend-panel.ts";
import type { ActivityChangeDetail } from "./components/markal-activity-panel.ts";
import type { BlockUpdateDetail } from "./components/markal-time-grid.ts";
import type { ExportFormat } from "./components/markal-export-modal.ts";
import type { CalendarRenamePayload } from "./components/markal-calendarios-modal.ts";
import type {
  Activity,
  BoardMode,
  CalendarCollection,
  CalendarDocument,
  CalendarSettings,
  DateRange,
  LegendItem,
  ScheduledBlock,
} from "./types.ts";
import {
  createCalendarDocument,
  createId,
  duplicateCalendarDocument,
} from "./lib/calendar-doc.ts";
import { normalizeRange, parseDateKey } from "./lib/dates.ts";
import { cleanBlocks, clampBlockTimes } from "./lib/blocks.ts";
import { buildStandaloneHtml } from "./lib/html-export.ts";
import { weekdayNarrowLabels } from "./lib/i18n-labels.ts";
import { iconStyles } from "./lib/icon-styles.ts";
import { localStyles } from "./lib/lit-styles.ts";
import {
  applyLegendToDate,
  cleanMarks,
  clampMaxMarksPerDay,
} from "./lib/marks.ts";
import {
  ensureSharedCalendar,
  getCalendarDoc,
  getCollectionSnapshot,
  getSelectedDocument,
  getShareInfo,
  initStorage,
  loadCalendarCollection,
  saveCalendarCollection,
  setShareInfo,
  type ShareInfo,
  subscribeToCollectionChanges,
} from "./lib/storage.ts";
import {
  buildShareLink,
  generateEncryptionKey,
  generateRoomId,
  isValidKey,
  isValidRoomId,
  parseShareFragment,
  type ShareLink,
} from "./lib/sync/share.ts";
import {
  connectShared,
  disconnectShared,
  getConnectedPeerCount,
  getConnectedPeers,
  setLocalUserName,
  subscribeToAwarenessChanges,
  subscribeToPeerChanges,
} from "./lib/sync/webrtc.ts";
import {
  getPreferences,
  setPreferences,
  subscribeToPreferences,
} from "./lib/preferences.ts";
import type { EncryptedEnvelope } from "./lib/cloud/crypto.ts";
import {
  applyPlainBackup,
  decryptAndApplyBackup,
  downloadBlobAsFile,
  exportBackupAsBlob,
  parseBackupText,
  suggestedBackupFilename,
} from "./lib/cloud/backup.ts";


const MOBILE_QUERY = "(max-width: 980px)";
const APP_VERSION = "0.1.0";
const REPO_URL = "https://github.com/adriandomc/markal";
const CHANGELOG_URL = `${REPO_URL}/releases`;

export class MarkalApp extends LitElement {
  static properties = {
    collection: { state: true },
    selectedLegendId: { state: true },
    boardMode: { state: true },
    selectedActivityId: { state: true },
    editingBlockId: { state: true },
    exportMessage: { state: true },
    isMobile: { state: true },
    legendSheetOpen: { state: true },
    activitySheetOpen: { state: true },
    infoOpen: { state: true },
    settingsOpen: { state: true },
    exportOpen: { state: true },
    calendariosOpen: { state: true },
    sharingCalendarId: { state: true },
    shareLink: { state: true },
    shareCopied: { state: true },
    loading: { state: true },
    backupMessage: { state: true },
    backupError: { state: true },
    backupBusy: { state: true },
    exportPanelOpen: { state: true },
    exportPassphrase: { state: true },
    pendingImportEnvelope: { state: true },
    importPassphrase: { state: true },

    connectedPeers: { state: true },
    peersOpen: { state: true },
    userName: { state: true },
  };

  collection: CalendarCollection | null = null;
  selectedLegendId = "";
  // UI-only state: NOT persisted to CalendarSettings (which syncs via Y.Doc),
  // so toggling the board mode never changes the view for collaborators.
  boardMode: BoardMode = "marks";
  selectedActivityId = "";
  editingBlockId: string | null = null;
  exportMessage = "";
  isMobile: boolean = this.matchesMobile();
  legendSheetOpen = false;
  activitySheetOpen = false;
  infoOpen = false;
  settingsOpen = false;
  exportOpen = false;
  calendariosOpen = false;
  sharingCalendarId: string | null = null;
  shareLink: ShareLink | null = null;
  shareCopied = false;
  loading = true;
  backupMessage = "";
  backupError = false;
  backupBusy: string | null = null;
  exportPanelOpen = false;
  exportPassphrase = "";
  pendingImportEnvelope: EncryptedEnvelope | null = null;
  importPassphrase = "";

  connectedPeers = 0;
  peersOpen = false;
  userName = "";

  private mobileQuery: MediaQueryList | null = null;
  private mobileListener: ((event: MediaQueryListEvent) => void) | null = null;
  private restoreFocusElement: HTMLElement | null = null;
  private unsubscribeCollection: (() => void) | null = null;
  private unsubscribePeers: (() => void) | null = null;
  private unsubscribeAwareness: (() => void) | null = null;
  private unsubscribePreferences: (() => void) | null = null;
  private userNameDebounce: ReturnType<typeof setTimeout> | null = null;

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

  connectedCallback(): void {
    super.connectedCallback();
    globalThis.addEventListener("keydown", this.handleGlobalKeydown);

    this.userName = getPreferences().userName;
    this.connectedPeers = getConnectedPeerCount();
    this.unsubscribePeers = subscribeToPeerChanges((count) => {
      this.connectedPeers = count;
    });
    this.unsubscribeAwareness = subscribeToAwarenessChanges(() => {
      if (this.peersOpen) this.requestUpdate();
    });
    this.unsubscribePreferences = subscribeToPreferences((prefs) => {
      this.userName = prefs.userName;
    });

    void this.initStorage();
    if (typeof globalThis.matchMedia !== "function") {
      return;
    }

    this.mobileQuery = globalThis.matchMedia(MOBILE_QUERY);
    this.mobileListener = (event: MediaQueryListEvent) => {
      this.isMobile = event.matches;
      if (!event.matches) {
        this.legendSheetOpen = false;
        this.activitySheetOpen = false;
      }
    };
    this.mobileQuery.addEventListener("change", this.mobileListener);
  }

  private async initStorage(): Promise<void> {
    try {


      // 1. Open storage (loads existing calendars, but does NOT auto-seed
      //    a default — we want to give share-landing a chance to populate first).
      await initStorage();

      // 2. If URL is a share landing, join the room (creates placeholder Y.Doc
      //    + attaches WebrtcProvider). This avoids creating a stray default.
      await this.maybeHandleShareLanding();

      // 3. Now ensure we have at least one calendar (seeds default if empty).
      const collection = await loadCalendarCollection();
      this.collection = collection;
      this.selectedLegendId =
        getSelectedDocument(collection).legends[0]?.id ?? "";
      this.selectedActivityId =
        getSelectedDocument(collection).activities[0]?.id ?? "";
      this.unsubscribeCollection = subscribeToCollectionChanges(
        (remoteCollection) => {
          this.collection = remoteCollection;
          const selected = getSelectedDocument(remoteCollection);
          if (!selected.legends.find((l) => l.id === this.selectedLegendId)) {
            this.selectedLegendId = selected.legends[0]?.id ?? "";
          }
          if (
            !selected.activities.find((a) => a.id === this.selectedActivityId)
          ) {
            this.selectedActivityId = selected.activities[0]?.id ?? "";
          }
        },
      );

      // 4. Reconnect WebrtcProvider for every calendar with shareInfo
      //    (auto-resume sharing after reload).
      for (const doc of collection.documents) {
        const info = getShareInfo(doc.id);
        if (info) this.connectCalendarSync(doc.id, info);
      }


    } finally {
      this.loading = false;
    }
  }



  private async maybeHandleShareLanding(): Promise<void> {
    if (typeof location === "undefined") return;
    const match = location.pathname.match(/^\/c\/([^\/]+)\/?$/);
    if (!match) return;
    const roomId = decodeURIComponent(match[1]);
    const key = parseShareFragment(location.hash);
    if (!isValidRoomId(roomId) || !key || !isValidKey(key)) return;

    // Storage was opened by caller via initStorage(); create the placeholder
    // for this room and attach the sync provider so peer data flows in.
    const calendarId = await ensureSharedCalendar(roomId);
    const info: ShareInfo = {
      roomId,
      encryptionKey: key,
      createdAt: new Date().toISOString(),
    };
    setShareInfo(calendarId, info);
    this.connectCalendarSync(calendarId, info);

    // Clean up URL so the key stops appearing in browser history.
    history.replaceState({}, "", "/");
  }

  private connectCalendarSync(calendarId: string, info: ShareInfo): void {
    const doc = getCalendarDoc(calendarId);
    if (!doc) return;
    connectShared({
      calendarId,
      roomId: info.roomId,
      encryptionKey: info.encryptionKey,
      doc,
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.mobileQuery && this.mobileListener) {
      this.mobileQuery.removeEventListener("change", this.mobileListener);
    }
    globalThis.removeEventListener("keydown", this.handleGlobalKeydown);
    if (this.unsubscribeCollection) {
      this.unsubscribeCollection();
      this.unsubscribeCollection = null;
    }
    if (this.unsubscribePeers) {
      this.unsubscribePeers();
      this.unsubscribePeers = null;
    }
    if (this.unsubscribeAwareness) {
      this.unsubscribeAwareness();
      this.unsubscribeAwareness = null;
    }
    if (this.unsubscribePreferences) {
      this.unsubscribePreferences();
      this.unsubscribePreferences = null;
    }
    if (this.userNameDebounce) {
      clearTimeout(this.userNameDebounce);
      this.userNameDebounce = null;
    }
  }

  private openCalendarios = (): void => {
    this.calendariosOpen = true;
  };

  private closeCalendarios = (): void => {
    this.calendariosOpen = false;
    this.closeShareView();
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

  private openActivitySheet = (): void => {
    this.captureFocus();
    this.activitySheetOpen = true;
  };

  private closeActivitySheet = (): void => {
    this.activitySheetOpen = false;
    this.restoreFocus();
  };

  private selectActivityFromChip = (id: string): void => {
    this.selectedActivityId = id;
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

  private openPeers = (): void => {
    this.peersOpen = true;
  };

  private closePeers = (): void => {
    this.peersOpen = false;
  };

  private applyUserName = (value: string): void => {
    this.userName = value;
    if (this.userNameDebounce) clearTimeout(this.userNameDebounce);
    this.userNameDebounce = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      setPreferences({ userName: trimmed });
      setLocalUserName(trimmed);
    }, 300);
  };

  private openShareForCalendar = (calendarId: string): void => {
    let info = getShareInfo(calendarId);
    if (!info) {
      info = {
        roomId: generateRoomId(),
        encryptionKey: generateEncryptionKey(),
        createdAt: new Date().toISOString(),
      };
      setShareInfo(calendarId, info);
      this.connectCalendarSync(calendarId, info);
    }
    const origin = typeof location !== "undefined"
      ? location.origin
      : "https://markal.app";
    this.shareLink = buildShareLink(origin, info.roomId, info.encryptionKey);
    this.shareCopied = false;
    this.sharingCalendarId = calendarId;
  };

  private closeShareView = (): void => {
    this.sharingCalendarId = null;
    this.shareLink = null;
    this.shareCopied = false;
  };

  private copyShareLink = async (): Promise<void> => {
    if (!this.shareLink) return;
    try {
      await navigator.clipboard.writeText(this.shareLink.url);
      this.shareCopied = true;
    } catch {
      this.shareCopied = false;
    }
  };

  private stopSharing = (calendarId: string): void => {
    disconnectShared(calendarId);
    setShareInfo(calendarId, null);
    this.closeShareView();
  };

  private setBackupMessage(message: string, isError: boolean): void {
    this.backupMessage = message;
    this.backupError = isError;
  }

  private setBackupError(error: unknown): void {
    this.backupMessage = error instanceof Error ? error.message : String(error);
    this.backupError = true;
  }

  private clearBackupMessage(): void {
    this.backupMessage = "";
    this.backupError = false;
  }

  private openExportPanel = (): void => {
    this.exportPanelOpen = true;
    this.exportPassphrase = "";
    this.clearBackupMessage();
  };

  private closeExportPanel = (): void => {
    this.exportPanelOpen = false;
    this.exportPassphrase = "";
  };

  private confirmExport = async (): Promise<void> => {
    try {
      this.backupBusy = "export";
      this.clearBackupMessage();
      const passphrase = this.exportPassphrase.trim() || undefined;
      const blob = await exportBackupAsBlob(passphrase);
      downloadBlobAsFile(blob, suggestedBackupFilename());
      this.exportPanelOpen = false;
      this.exportPassphrase = "";
      this.setBackupMessage(msg("Respaldo descargado"), false);
    } catch (error) {
      this.setBackupError(error);
    } finally {
      this.backupBusy = null;
    }
  };

  private applyImportFile = async (file: File): Promise<void> => {
    try {
      this.backupBusy = "import";
      this.clearBackupMessage();
      const text = await file.text();
      const parsed = await parseBackupText(text);
      if (parsed.kind === "plain") {
        await applyPlainBackup(parsed.backup);
        this.refreshFromStorage();
        this.setBackupMessage(msg("Respaldo importado"), false);
      } else {
        this.pendingImportEnvelope = parsed.envelope;
        this.importPassphrase = "";
      }
    } catch (error) {
      this.setBackupError(error);
    } finally {
      this.backupBusy = null;
    }
  };

  private confirmImportPassphrase = async (): Promise<void> => {
    if (!this.pendingImportEnvelope) return;
    try {
      this.backupBusy = "import";
      this.clearBackupMessage();
      await decryptAndApplyBackup(
        this.pendingImportEnvelope,
        this.importPassphrase,
      );
      this.refreshFromStorage();
      this.pendingImportEnvelope = null;
      this.importPassphrase = "";
      this.setBackupMessage(msg("Respaldo importado"), false);
    } catch (error) {
      this.setBackupError(error);
    } finally {
      this.backupBusy = null;
    }
  };

  private cancelImport = (): void => {
    this.pendingImportEnvelope = null;
    this.importPassphrase = "";
    this.clearBackupMessage();
  };



  private refreshFromStorage(): void {
    const snapshot = getCollectionSnapshot();
    if (!snapshot) return;
    this.collection = snapshot;
    const selected = getSelectedDocument(snapshot);
    if (!selected.legends.find((l) => l.id === this.selectedLegendId)) {
      this.selectedLegendId = selected.legends[0]?.id ?? "";
    }
    if (!selected.activities.find((a) => a.id === this.selectedActivityId)) {
      this.selectedActivityId = selected.activities[0]?.id ?? "";
    }
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("legendSheetOpen") && this.legendSheetOpen) {
      this.focusDialog(".legend-sheet.open");
    }
    if (changed.has("activitySheetOpen") && this.activitySheetOpen) {
      this.focusDialog(".legend-sheet.open");
    }
  }

  private handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.editingBlockId !== null) {
      event.preventDefault();
      this.closeBlockEditor();
      return;
    }

    if (this.calendariosOpen && this.sharingCalendarId) {
      event.preventDefault();
      this.closeShareView();
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

    if (this.activitySheetOpen) {
      event.preventDefault();
      this.closeActivitySheet();
      return;
    }

    if (this.calendariosOpen) {
      event.preventDefault();
      this.closeCalendarios();
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
      <nav class="quick-bar" aria-label="${msg("Acciones rápidas")}">
        <markal-icon-button
          icon="calendar-dots"
          label="${msg("Calendarios")}"
          size="lg"
          variant="strong"
          @click="${this.openCalendarios}"
        ></markal-icon-button>
        <markal-icon-button
          icon="users"
          label="${this.connectedPeers > 0
            ? msg(str`Conexiones (${this.connectedPeers})`)
            : msg("Conexiones")}"
          size="lg"
          variant="strong"
          class="${this.connectedPeers > 0 ? "peers-active" : ""}"
          @click="${this.openPeers}"
        ></markal-icon-button>
        <markal-icon-button
          icon="export"
          label="${msg("Exportar")}"
          size="lg"
          variant="strong"
          @click="${this.openExport}"
        ></markal-icon-button>
        <markal-icon-button
          icon="gear-six"
          label="${msg("Configuración")}"
          size="lg"
          variant="strong"
          @click="${this.openSettings}"
        ></markal-icon-button>
        <markal-icon-button
          icon="info"
          label="${msg("Información")}"
          size="lg"
          variant="strong"
          @click="${this.openInfo}"
        ></markal-icon-button>
      </nav>
      <main class="app-shell">
        <div class="main-pane">
          <section class="range-row">
            <markal-mode-switch
              .mode="${this.boardMode}"
              @mode-change="${(event: CustomEvent<BoardMode>) => {
                this.boardMode = event.detail;
              }}"
            ></markal-mode-switch>
            <markal-date-range-control
              .range="${document.dateRange}"
              @range-change="${this.changeRange}"
            ></markal-date-range-control>
          </section>

          <section class="workspace">
            ${this.boardMode === "schedule"
              ? html`
                <markal-time-grid
                  .document="${document}"
                  .selectedActivityId="${this.selectedActivityId}"
                  @block-create="${this.createBlock}"
                  @block-update="${this.updateBlock}"
                  @block-edit="${this.openBlockEditor}"
                ></markal-time-grid>
              `
              : html`
                <markal-calendar-board
                  .document="${document}"
                  .selectedLegendId="${this.selectedLegendId}"
                  @day-mark="${this.markDay}"
                ></markal-calendar-board>
              `}
            ${this.isMobile ? nothing : this.renderSidePanel(document)}
          </section>
        </div>
      </main>
      ${this.isMobile
        ? (this.boardMode === "schedule"
          ? this.renderActivityDock(document.activities)
          : this.renderLegendDock(document.legends))
        : nothing}
      ${this.renderSettingsModal()}
      ${this.renderInfoModal()}
      ${this.renderExportModal()}
      ${this.renderCalendariosModal()}
      ${this.renderPeersModal()}
      ${this.renderBlockEditor()}
    `;
  }

  private renderSidePanel(document: CalendarDocument) {
    if (this.boardMode === "schedule") {
      return html`
        <markal-activity-panel
          .activities="${document.activities}"
          .selectedActivityId="${this.selectedActivityId}"
          @activity-select="${this.selectActivity}"
          @activity-change="${this.changeActivity}"
          @activity-add="${this.addActivity}"
          @activity-remove="${this.removeActivity}"
          @activity-reorder="${this.reorderActivities}"
        ></markal-activity-panel>
      `;
    }
    return html`
      <markal-legend-panel
        .legends="${document.legends}"
        .selectedLegendId="${this.selectedLegendId}"
        @legend-select="${this.selectLegend}"
        @legend-change="${this.changeLegend}"
        @legend-add="${this.addLegend}"
        @legend-remove="${this.removeLegend}"
        @legend-reorder="${this.reorderLegends}"
      ></markal-legend-panel>
    `;
  }

  private renderBlockEditor() {
    const block = this.editingBlockId
      ? this.selectedDocument.blocks[this.editingBlockId] ?? null
      : null;
    return html`
      <markal-block-editor
        ?open="${block !== null}"
        .block="${block}"
        .activities="${this.selectedDocument.activities}"
        @markal-close="${this.closeBlockEditor}"
        @block-update="${this.updateBlock}"
        @block-delete="${this.removeBlock}"
      ></markal-block-editor>
    `;
  }

  private renderExportModal() {
    return html`
      <markal-export-modal
        ?open="${this.exportOpen}"
        .exportMessage="${this.exportMessage}"
        @markal-close="${this.closeExport}"
        @export-format="${(e: CustomEvent<ExportFormat>) =>
          this.exportCalendar(e.detail)}"
      ></markal-export-modal>
    `;
  }

  private renderSettingsModal() {
    return html`
      <markal-settings-modal
        ?open="${this.settingsOpen}"
        .userName="${this.userName}"
        .settings="${this.selectedDocument.settings}"
        .currentLocale="${this.currentLocale}"

        ?exportPanelOpen="${this.exportPanelOpen}"
        .exportPassphrase="${this.exportPassphrase}"
        .pendingImportEnvelope="${this.pendingImportEnvelope}"
        .importPassphrase="${this.importPassphrase}"
        .backupMessage="${this.backupMessage}"
        ?backupError="${this.backupError}"
        .backupBusy="${this.backupBusy}"
        @markal-close="${this.closeSettings}"
        @user-name-input="${(e: CustomEvent<string>) =>
          this.applyUserName(e.detail)}"
        @settings-change="${(e: CustomEvent<Partial<CalendarSettings>>) =>
          this.updateSettings(e.detail)}"
        @locale-change="${(e: CustomEvent<LocaleCode>) =>
          this.changeLocale(e.detail)}"
        @export-panel-open="${this.openExportPanel}"
        @export-panel-close="${this.closeExportPanel}"
        @export-confirm="${this.confirmExport}"
        @export-passphrase-change="${(e: CustomEvent<string>) => {
          this.exportPassphrase = e.detail;
        }}"
        @import-file-chosen="${(e: CustomEvent<File>) =>
          this.applyImportFile(e.detail)}"
        @import-confirm="${this.confirmImportPassphrase}"
        @import-cancel="${this.cancelImport}"
        @import-passphrase-change="${(e: CustomEvent<string>) => {
          this.importPassphrase = e.detail;
        }}"

      ></markal-settings-modal>
    `;
  }

  private renderInfoModal() {
    return html`
      <markal-info-modal
        ?open="${this.infoOpen}"
        .appVersion="${APP_VERSION}"
        .repoUrl="${REPO_URL}"
        .changelogUrl="${CHANGELOG_URL}"
        @markal-close="${this.closeInfo}"
      ></markal-info-modal>
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
          class="${`legend-peek${this.legendSheetOpen ? " is-hidden" : ""}`}"
          role="toolbar"
          aria-label="${msg("Selector de leyenda")}"
          aria-hidden="${String(this.legendSheetOpen)}"
          ?inert="${this.legendSheetOpen}"
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
              @legend-reorder="${this.reorderLegends}"
            ></markal-legend-panel>
          </div>
        </div>
      </div>
    `;
  }

  // Mirror of renderLegendDock for schedule mode; reuses the same bottom-sheet
  // CSS classes (legend-dock/peek/chip/sheet) with activity data.
  private renderActivityDock(activities: Activity[]) {
    return html`
      <div
        class="${`legend-backdrop${this.activitySheetOpen ? " visible" : ""}`}"
        @click="${this.closeActivitySheet}"
      >
      </div>
      <div class="legend-dock">
        <div
          class="${`legend-peek${this.activitySheetOpen ? " is-hidden" : ""}`}"
          role="toolbar"
          aria-label="${msg("Selector de actividad")}"
          aria-hidden="${String(this.activitySheetOpen)}"
          ?inert="${this.activitySheetOpen}"
        >
          <div class="legend-chips">
            ${activities.map((activity) =>
              html`
                <button
                  class="${`legend-chip${
                    activity.id === this.selectedActivityId ? " selected" : ""
                  }`}"
                  type="button"
                  style="${`--chip-color: ${activity.fillColor}`}"
                  aria-label="${activity.label || msg("Actividad")}"
                  aria-pressed="${String(
                    activity.id === this.selectedActivityId,
                  )}"
                  @click="${() => this.selectActivityFromChip(activity.id)}"
                >
                </button>
              `
            )}
          </div>
          <button
            class="legend-edit"
            type="button"
            aria-label="${msg("Editar actividades")}"
            @click="${this.openActivitySheet}"
          >
            <i class="ph ph-pencil-simple"></i>
          </button>
        </div>
        <div
          class="${`legend-sheet${this.activitySheetOpen ? " open" : ""}`}"
          role="dialog"
          aria-label="${msg("Editor de actividades")}"
          aria-modal="${String(this.activitySheetOpen)}"
          aria-hidden="${String(!this.activitySheetOpen)}"
          tabindex="-1"
          ?inert="${!this.activitySheetOpen}"
        >
          <header class="legend-sheet-header">
            <span class="legend-sheet-title">${msg("Actividades")}</span>
            <markal-icon-button
              icon="x"
              label="${msg("Cerrar")}"
              @click="${this.closeActivitySheet}"
            ></markal-icon-button>
          </header>
          <div class="legend-sheet-body">
            <markal-activity-panel
              embedded
              .activities="${activities}"
              .selectedActivityId="${this.selectedActivityId}"
              @activity-select="${this.selectActivity}"
              @activity-change="${this.changeActivity}"
              @activity-add="${this.addActivity}"
              @activity-remove="${this.removeActivity}"
              @activity-reorder="${this.reorderActivities}"
            ></markal-activity-panel>
          </div>
        </div>
      </div>
    `;
  }

  private renderCalendariosModal() {
    const documents = this.collection?.documents ?? [];
    const sharedIds = new Set(
      documents.filter((doc) => Boolean(getShareInfo(doc.id))).map((d) => d.id),
    );
    return html`
      <markal-calendarios-modal
        ?open="${this.calendariosOpen}"
        .documents="${documents}"
        .selectedId="${this.collection?.selectedId ?? ""}"
        .sharedIds="${sharedIds}"
        .sharingCalendarId="${this.sharingCalendarId}"
        .shareLink="${this.shareLink}"
        ?shareCopied="${this.shareCopied}"
        @markal-close="${this.closeCalendarios}"
        @calendar-create="${this.createCalendar}"
        @calendar-select="${(e: CustomEvent<string>) =>
          this.selectCalendarById(e.detail)}"
        @calendar-rename="${(e: CustomEvent<CalendarRenamePayload>) =>
          this.renameCalendarById(e.detail.id, e.detail.title)}"
        @calendar-duplicate="${(e: CustomEvent<string>) =>
          this.duplicateCalendarFromEvent(e.detail)}"
        @calendar-delete="${(e: CustomEvent<string>) =>
          this.deleteCalendarFromEvent(e.detail)}"
        @calendar-share="${(e: CustomEvent<string>) =>
          this.openShareForCalendar(e.detail)}"
        @calendar-reorder="${this.reorderCalendars}"
        @share-back="${this.closeShareView}"
        @share-copy="${this.copyShareLink}"
        @share-stop="${(e: CustomEvent<string>) => this.stopSharing(e.detail)}"
      ></markal-calendarios-modal>
    `;
  }

  private renderPeersModal() {
    const peers = this.peersOpen ? getConnectedPeers() : [];
    const calendarTitles: Record<string, string> = {};
    for (const doc of this.collection?.documents ?? []) {
      calendarTitles[doc.id] = doc.title;
    }
    return html`
      <markal-peers-modal
        ?open="${this.peersOpen}"
        .userName="${this.userName}"
        .peers="${peers}"
        .calendarTitles="${calendarTitles}"
        @markal-close="${this.closePeers}"
      ></markal-peers-modal>
    `;
  }

  private reorderCalendars = (event: CustomEvent<string[]>): void => {
    const collection = this.collection;
    if (!collection) return;
    const byId = new Map(collection.documents.map((d) => [d.id, d]));
    const reordered: CalendarDocument[] = [];
    for (const id of event.detail) {
      const doc = byId.get(id);
      if (doc) reordered.push(doc);
    }
    if (reordered.length !== collection.documents.length) return;
    this.persist({ ...collection, documents: reordered });
  };

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
    this.selectedActivityId = selected?.activities[0]?.id ?? "";
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
    this.selectedActivityId = document.activities[0]?.id ?? "";
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
    this.selectedActivityId = document.activities[0]?.id ?? "";
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
    this.selectedActivityId = selected.activities[0]?.id ?? "";
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
    this.updateSelectedDocument((document) => {
      const nextSettings: CalendarSettings = {
        ...document.settings,
        ...patch,
        maxMarksPerDay: clampMaxMarksPerDay(
          patch.maxMarksPerDay ?? document.settings.maxMarksPerDay,
        ),
      };

      let nextMarks = document.marks;
      if (patch.selectWeekends === false && document.settings.selectWeekends) {
        nextMarks = Object.fromEntries(
          Object.entries(document.marks).filter(([date]) => {
            const dayOfWeek = parseDateKey(date).getDay();
            return dayOfWeek !== 0 && dayOfWeek !== 6;
          }),
        );
      }

      return {
        ...document,
        settings: nextSettings,
        marks: nextMarks,
      };
    });
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

  private reorderLegends = (event: CustomEvent<string[]>): void => {
    const orderedIds = event.detail;
    this.updateSelectedDocument((document) => {
      const byId = new Map(document.legends.map((legend) => [legend.id, legend]));
      const reordered: LegendItem[] = [];
      for (const id of orderedIds) {
        const legend = byId.get(id);
        if (legend) {
          reordered.push(legend);
          byId.delete(id);
        }
      }
      for (const legend of byId.values()) {
        reordered.push(legend);
      }
      if (reordered.length !== document.legends.length) {
        return document;
      }
      return { ...document, legends: reordered };
    });
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

  private selectActivity = (event: CustomEvent<string>): void => {
    this.selectedActivityId = event.detail;
  };

  private changeActivity = (event: CustomEvent<ActivityChangeDetail>): void => {
    const { id, patch } = event.detail;
    this.updateSelectedDocument((document) => ({
      ...document,
      activities: document.activities.map((
        activity,
      ) => (activity.id === id ? { ...activity, ...patch } : activity)),
    }));
  };

  private addActivity = (): void => {
    const activity: Activity = {
      id: createId("activity"),
      label: "",
      fillColor: "#a2c8f3",
    };
    this.selectedActivityId = activity.id;
    this.updateSelectedDocument((document) => ({
      ...document,
      activities: [...document.activities, activity],
    }));
  };

  private reorderActivities = (event: CustomEvent<string[]>): void => {
    const orderedIds = event.detail;
    this.updateSelectedDocument((document) => {
      const byId = new Map(
        document.activities.map((activity) => [activity.id, activity]),
      );
      const reordered: Activity[] = [];
      for (const id of orderedIds) {
        const activity = byId.get(id);
        if (activity) {
          reordered.push(activity);
          byId.delete(id);
        }
      }
      for (const activity of byId.values()) {
        reordered.push(activity);
      }
      if (reordered.length !== document.activities.length) {
        return document;
      }
      return { ...document, activities: reordered };
    });
  };

  private removeActivity = (event: CustomEvent<string>): void => {
    const id = event.detail;
    const document = this.selectedDocument;
    // Unlike legends (minimum 1), zero activities is valid: it just disables
    // creating new blocks.
    const activities = document.activities.filter((activity) =>
      activity.id !== id
    );
    if (this.selectedActivityId === id) {
      this.selectedActivityId = activities[0]?.id ?? "";
    }
    this.updateSelectedDocument((current) => ({
      ...current,
      activities,
      blocks: cleanBlocks(current.blocks, activities), // cascade
    }));
  };

  private createBlock = (
    event: CustomEvent<Omit<ScheduledBlock, "id">>,
  ): void => {
    const block: ScheduledBlock = { ...event.detail, id: createId("block") };
    this.updateSelectedDocument((document) => ({
      ...document,
      blocks: { ...document.blocks, [block.id]: block },
    }));
  };

  private updateBlock = (event: CustomEvent<BlockUpdateDetail>): void => {
    const { id, patch } = event.detail;
    this.updateSelectedDocument((document) => {
      const current = document.blocks[id];
      if (!current) return document;
      const merged = { ...current, ...patch };
      // Normalize in case the patch left dates/times inverted.
      const range = normalizeRange({
        start: merged.startDate,
        end: merged.endDate,
      });
      const times = clampBlockTimes(merged.startMinutes, merged.endMinutes);
      return {
        ...document,
        blocks: {
          ...document.blocks,
          [id]: {
            ...merged,
            startDate: range.start,
            endDate: range.end,
            ...times,
          },
        },
      };
    });
  };

  private removeBlock = (event: CustomEvent<string>): void => {
    const id = event.detail;
    this.updateSelectedDocument((document) => {
      const blocks = { ...document.blocks };
      delete blocks[id];
      return { ...document, blocks };
    });
  };

  private openBlockEditor = (event: CustomEvent<string>): void => {
    this.editingBlockId = event.detail;
  };

  private closeBlockEditor = (): void => {
    this.editingBlockId = null;
  };

  private markDay = (event: CustomEvent<DayMarkDetail>): void => {
    if (!this.selectedLegendId) {
      return;
    }

    const { dates, action } = event.detail;

    this.updateSelectedDocument((document) => {
      const marks = { ...document.marks };
      const allowWeekends = document.settings.selectWeekends;

      for (const date of dates) {
        if (!allowWeekends) {
          const dayOfWeek = parseDateKey(date).getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            continue;
          }
        }
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

  private exportCalendar = async (format: ExportFormat): Promise<void> => {
    if (format === "html") {
      this.exportHtml();
      return;
    }
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

  // Self-contained, read-only HTML — built client-side (no server) so it works
  // offline and is shareable as a single file.
  private exportHtml = (): void => {
    try {
      const html = buildStandaloneHtml(this.selectedDocument, {
        locale: getLocale(),
        initialView: this.boardMode,
        labels: {
          monthView: msg("Vista de mes"),
          weekView: msg("Vista de semana"),
          today: msg("Hoy"),
          prevWeek: msg("Semana anterior"),
          nextWeek: msg("Semana siguiente"),
          legends: msg("Leyendas"),
          activities: msg("Actividades"),
          readOnly: msg("Solo lectura"),
          weekdays: weekdayNarrowLabels(),
        },
      });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const filename = `${
        this.selectedDocument.title.replace(/[^\w-]+/g, "-").toLowerCase() ||
        "markal"
      }.html`;
      downloadBlobAsFile(blob, filename);
      this.exportMessage = msg("HTML listo");
    } catch (error) {
      this.exportMessage = error instanceof Error
        ? error.message
        : msg("No se pudo exportar");
    }
  };
}

customElements.define("markal-app", MarkalApp);
