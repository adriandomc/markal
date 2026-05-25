import { html, LitElement, nothing } from "lit";
import { msg, str, updateWhenLocaleChanges } from "@lit/localize";
import settingsModalStyles from "./markal-settings-modal.scss?inline";
import "./markal-modal.ts";
import "./markal-tabs.ts";
import "./markal-tab.ts";
import "./markal-settings-row.ts";
import "./markal-switch.ts";
import "./markal-radio-group.ts";
import type { CalendarSettings } from "../types.ts";
import type { EncryptedEnvelope } from "../lib/cloud/crypto.ts";
import { ABSOLUTE_MAX_MARKS_PER_DAY } from "../lib/marks.ts";
import {
  LOCALE_OPTIONS,
  type LocaleCode,
} from "../i18n/setup.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalSettingsModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    userName: { type: String },
    settings: { attribute: false },
    currentLocale: { type: String },
    driveConfigured: { type: Boolean },
    driveConnected: { type: Boolean },
    drivePassphrase: { type: String },
    driveLastSync: { type: String },
    exportPanelOpen: { type: Boolean },
    exportPassphrase: { type: String },
    pendingImportEnvelope: { attribute: false },
    importPassphrase: { type: String },
    backupMessage: { type: String },
    backupError: { type: Boolean },
    backupBusy: { type: String },
  };

  open = false;
  userName = "";
  settings: CalendarSettings = { showOutMonthMarks: true, maxMarksPerDay: 4 };
  currentLocale: LocaleCode = "es";
  driveConfigured = false;
  driveConnected = false;
  drivePassphrase = "";
  driveLastSync: string | null = null;
  exportPanelOpen = false;
  exportPassphrase = "";
  pendingImportEnvelope: EncryptedEnvelope | null = null;
  importPassphrase = "";
  backupMessage = "";
  backupError = false;
  backupBusy: string | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(settingsModalStyles)];

  render() {
    const maxMarksOptions = Array.from(
      { length: ABSOLUTE_MAX_MARKS_PER_DAY },
      (_, index) => index + 1,
    );

    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Configuración")}"
        size="lg"
        @markal-close="${this.requestClose}"
      >
        <markal-tabs>
          <markal-tab name="general" label="${msg("General")}">
            <markal-settings-row
              rowTitle="${msg("Tu nombre")}"
              helpText="${msg(
                "Aparece para las personas con quienes compartes calendarios.",
              )}"
            >
              <input
                class="user-name-input"
                type="text"
                aria-label="${msg("Tu nombre")}"
                .value="${this.userName}"
                @input="${(event: InputEvent) =>
                  this.emit(
                    "user-name-input",
                    (event.target as HTMLInputElement).value,
                  )}"
              />
            </markal-settings-row>
          </markal-tab>

          <markal-tab name="display" label="${msg("Calendario")}">
            <markal-settings-row
              rowTitle="${msg("Mostrar marcas de otros meses")}"
              helpText="${msg(
                "Visualiza las marcas en los días que se asoman desde meses adyacentes.",
              )}"
            >
              <markal-switch
                ?checked="${this.settings.showOutMonthMarks}"
                label="${msg("Mostrar marcas de otros meses")}"
                @change="${(event: CustomEvent<boolean>) =>
                  this.emit("settings-change", {
                    showOutMonthMarks: event.detail,
                  })}"
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
                .options="${maxMarksOptions.map((value) => ({
                  value,
                  label: String(value),
                }))}"
                .value="${this.settings.maxMarksPerDay}"
                groupLabel="${msg("Leyendas por día")}"
                @markal-change="${(event: CustomEvent<number>) =>
                  this.emit("settings-change", {
                    maxMarksPerDay: event.detail,
                  })}"
              ></markal-radio-group>
            </markal-settings-row>
          </markal-tab>

          <markal-tab name="language" label="${msg("Idioma")}">
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
                  this.emit("locale-change", event.detail as LocaleCode)}"
              ></markal-radio-group>
            </markal-settings-row>
          </markal-tab>

          <markal-tab name="backup" label="${msg("Respaldo")}">
            <markal-settings-row
              stacked
              rowTitle="${msg("Respaldo y sincronización")}"
              helpText="${msg(
                "Exporta tus datos como archivo o sincroniza con tu propia nube. Markal nunca toca tus datos en sus servidores.",
              )}"
            >
              <div class="backup">
                <div class="backup-block">
                  <div class="backup-block-title">
                    <i class="ph ph-floppy-disk"></i>
                    ${msg("Archivo local")}
                  </div>
                  ${this.exportPanelOpen
                    ? this.renderExportPanel()
                    : html`
                      <button
                        class="backup-btn"
                        type="button"
                        ?disabled="${this.backupBusy !== null}"
                        @click="${() => this.emit("export-panel-open")}"
                      >
                        <i class="ph ph-download-simple"></i>
                        ${msg("Exportar a archivo")}
                      </button>
                    `}
                  <button
                    class="backup-btn"
                    type="button"
                    ?disabled="${this.backupBusy !== null ||
                      this.pendingImportEnvelope !== null}"
                    @click="${this.openFilePicker}"
                  >
                    <i class="ph ph-upload-simple"></i>
                    ${msg("Importar desde archivo")}
                  </button>
                  ${this.pendingImportEnvelope
                    ? this.renderImportPanel()
                    : nothing}
                  <input
                    class="backup-import-input"
                    type="file"
                    accept="application/json,.markal,.json"
                    hidden
                    @change="${this.handleFileChosen}"
                  />
                </div>
                <div class="backup-block">
                  <div class="backup-block-title">
                    <i class="ph ph-google-drive-logo"></i>
                    ${msg("Google Drive")}
                  </div>
                  ${this.renderDrivePanel()}
                </div>
                ${this.backupMessage
                  ? html`
                    <div
                      class="${`backup-status${
                        this.backupError ? " is-error" : ""
                      }`}"
                      role="status"
                    >
                      ${this.backupMessage}
                    </div>
                  `
                  : nothing}
              </div>
            </markal-settings-row>
          </markal-tab>
        </markal-tabs>
      </markal-modal>
    `;
  }

  private renderExportPanel() {
    return html`
      <div class="backup-panel">
        <label class="backup-field">
          <span class="backup-field-label">
            ${msg("Contraseña (opcional)")}
          </span>
          <input
            class="backup-input"
            type="password"
            autocomplete="new-password"
            .value="${this.exportPassphrase}"
            @input="${(event: Event) =>
              this.emit(
                "export-passphrase-change",
                (event.target as HTMLInputElement).value,
              )}"
          />
          <span class="backup-field-hint">
            ${msg("Sin contraseña, el archivo no se cifra.")}
          </span>
        </label>
        <div class="backup-panel-actions">
          <button
            class="backup-btn primary"
            type="button"
            ?disabled="${this.backupBusy !== null}"
            @click="${() => this.emit("export-confirm")}"
          >
            ${msg("Descargar respaldo")}
          </button>
          <button
            class="backup-btn ghost"
            type="button"
            @click="${() => this.emit("export-panel-close")}"
          >
            ${msg("Cancelar")}
          </button>
        </div>
      </div>
    `;
  }

  private renderImportPanel() {
    return html`
      <div class="backup-panel">
        <label class="backup-field">
          <span class="backup-field-label">
            ${msg("Contraseña del respaldo")}
          </span>
          <input
            class="backup-input"
            type="password"
            autocomplete="off"
            .value="${this.importPassphrase}"
            @input="${(event: Event) =>
              this.emit(
                "import-passphrase-change",
                (event.target as HTMLInputElement).value,
              )}"
          />
        </label>
        <div class="backup-panel-actions">
          <button
            class="backup-btn primary"
            type="button"
            ?disabled="${this.backupBusy !== null}"
            @click="${() => this.emit("import-confirm")}"
          >
            ${msg("Restaurar")}
          </button>
          <button
            class="backup-btn ghost"
            type="button"
            @click="${() => this.emit("import-cancel")}"
          >
            ${msg("Cancelar")}
          </button>
        </div>
      </div>
    `;
  }

  private renderDrivePanel() {
    if (!this.driveConfigured) {
      return html`
        <p class="backup-help">
          ${msg(
            "Drive no está habilitado en esta instancia. El operador necesita registrar un OAuth client_id de Google.",
          )}
        </p>
      `;
    }
    if (!this.driveConnected) {
      return html`
        <p class="backup-help">
          ${msg(
            "Guarda un respaldo cifrado en tu propia cuenta de Drive. Markal nunca verá la contraseña ni los datos descifrados.",
          )}
        </p>
        <button
          class="backup-btn primary"
          type="button"
          @click="${() => this.emit("drive-connect")}"
        >
          <i class="ph ph-google-drive-logo"></i>
          ${msg("Conectar Google Drive")}
        </button>
      `;
    }
    return html`
      <p class="backup-help">
        ${msg(
          "Si olvidas la contraseña no podemos descifrar tu respaldo. Guárdala en un lugar seguro.",
        )}
      </p>
      ${this.driveLastSync
        ? html`
          <p class="backup-meta">
            ${msg(str`Última sincronización: ${this.driveLastSync}`)}
          </p>
        `
        : nothing}
      <label class="backup-field">
        <span class="backup-field-label">
          ${msg("Contraseña de cifrado")}
        </span>
        <input
          class="backup-input"
          type="password"
          autocomplete="off"
          .value="${this.drivePassphrase}"
          @input="${(event: Event) =>
            this.emit(
              "drive-passphrase-change",
              (event.target as HTMLInputElement).value,
            )}"
        />
      </label>
      <div class="backup-panel-actions">
        <button
          class="backup-btn primary"
          type="button"
          ?disabled="${this.backupBusy !== null}"
          @click="${() => this.emit("drive-push")}"
        >
          <i class="ph ph-cloud-arrow-up"></i>
          ${msg("Subir a Drive")}
        </button>
        <button
          class="backup-btn"
          type="button"
          ?disabled="${this.backupBusy !== null}"
          @click="${() => this.emit("drive-pull")}"
        >
          <i class="ph ph-cloud-arrow-down"></i>
          ${msg("Descargar de Drive")}
        </button>
        <button
          class="backup-btn ghost"
          type="button"
          @click="${() => this.emit("drive-disconnect")}"
        >
          <i class="ph ph-sign-out"></i>
          ${msg("Desconectar")}
        </button>
      </div>
    `;
  }

  private openFilePicker = (): void => {
    const input = this.renderRoot.querySelector<HTMLInputElement>(
      ".backup-import-input",
    );
    input?.click();
  };

  private handleFileChosen = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.emit<File>("import-file-chosen", file);
    input.value = "";
  };

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };

  private emit<T = void>(type: string, detail?: T): void {
    this.dispatchEvent(
      new CustomEvent<T | undefined>(type, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("markal-settings-modal", MarkalSettingsModal);
