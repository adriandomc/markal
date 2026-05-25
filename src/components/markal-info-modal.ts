import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import infoModalStyles from "./markal-info-modal.scss?inline";
import "./markal-modal.ts";
import "./markal-tabs.ts";
import "./markal-tab.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalInfoModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    appVersion: { type: String },
    repoUrl: { type: String },
    changelogUrl: { type: String },
  };

  open = false;
  appVersion = "";
  repoUrl = "";
  changelogUrl = "";

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(infoModalStyles)];

  render() {
    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Acerca de Markal")}"
        @markal-close="${this.requestClose}"
      >
        <markal-tabs>
          <markal-tab name="about" label="${msg("Acerca de")}">
            <div class="info-brand">
              <img
                class="info-brand-logo"
                src="/favicon.svg"
                alt="Markal"
                width="72"
                height="72"
              />
              <span class="info-brand-name">Markal</span>
            </div>
            <p class="info-description">
              ${msg(
                "Markal es una herramienta para crear calendarios marcables. Sólo tienes que definir un rango de fechas, definir el color de la leyenda y ¡comenzar a marcar tu calendario!",
              )}
            </p>
          </markal-tab>

          <markal-tab name="privacy" label="${msg("Privacidad")}">
            <section class="info-privacy">
              <h3 class="info-privacy-title">
                <i class="ph ph-key"></i>
                ${msg("Privacidad y seguridad")}
              </h3>
              <ul class="info-privacy-list">
                <li>
                  ${msg(
                    "Tus calendarios viven solo en tu navegador. Markal no guarda ningún dato en el servidor.",
                  )}
                </li>
                <li>
                  ${msg(
                    "Los calendarios compartidos están cifrados extremo a extremo (AES-GCM-256). La clave viaja en el enlace, que nunca llega a un servidor.",
                  )}
                </li>
                <li>
                  ${msg(
                    "El respaldo en Google Drive (opcional) viaja cifrado con tu contraseña. Markal no puede leer el contenido.",
                  )}
                </li>
              </ul>
              <a class="info-privacy-link" href="/privacy">
                ${msg("Leer política completa →")}
              </a>
            </section>
          </markal-tab>

          <markal-tab name="details" label="${msg("Detalles")}">
            <div class="info-meta">
              <div class="info-meta-row">
                <span class="info-meta-label">${msg("Versión")}</span>
                <span class="info-meta-value">${this.appVersion}</span>
              </div>
              <div class="info-meta-row">
                <span class="info-meta-label">${msg("Repositorio")}</span>
                <a
                  class="info-link"
                  href="${this.repoUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                >GitHub</a>
              </div>
              <div class="info-meta-row">
                <span class="info-meta-label">${msg("Changelog")}</span>
                <a
                  class="info-link"
                  href="${this.changelogUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                >Releases</a>
              </div>
            </div>
          </markal-tab>
        </markal-tabs>

        <div slot="footer" class="info-modal-footer">
          <p>
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

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };
}

customElements.define("markal-info-modal", MarkalInfoModal);
