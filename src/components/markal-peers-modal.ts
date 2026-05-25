import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";
import peersModalStyles from "./markal-peers-modal.scss?inline";
import "./markal-modal.ts";
import type { PeerInfo } from "../lib/sync/webrtc.ts";
import { iconStyles } from "../lib/icon-styles.ts";
import { localStyles } from "../lib/lit-styles.ts";

export class MarkalPeersModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    userName: { type: String },
    peers: { attribute: false },
    calendarTitles: { attribute: false },
  };

  open = false;
  userName = "";
  peers: PeerInfo[] = [];
  calendarTitles: Record<string, string> = {};

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  static styles = [iconStyles, localStyles(peersModalStyles)];

  render() {
    const grouped = new Map<string, PeerInfo[]>();
    for (const peer of this.peers) {
      const list = grouped.get(peer.calendarId) ?? [];
      list.push(peer);
      grouped.set(peer.calendarId, list);
    }
    const calendarLabel = (id: string): string =>
      this.calendarTitles[id] ?? msg("Calendario");

    return html`
      <markal-modal
        ?open="${this.open}"
        label="${msg("Conexiones")}"
        @markal-close="${this.requestClose}"
      >
        <div class="peers-self">
          <span class="peers-self-label">${msg("Tu nombre")}</span>
          <span class="peers-self-name">${this.userName}</span>
          <span class="peers-self-hint">
            ${msg("Cambia tu nombre en Configuración.")}
          </span>
        </div>
        ${this.peers.length === 0
          ? html`
            <p class="peers-empty">
              ${msg("Nadie está conectado a tus calendarios.")}
            </p>
          `
          : html`
            <div class="peers-list">
              ${Array.from(grouped.entries()).map(
                ([calendarId, list]) => html`
                  <section class="peers-group">
                    <h4 class="peers-group-title">
                      ${calendarLabel(calendarId)}
                    </h4>
                    <ul class="peers-group-list">
                      ${list.map(
                        (peer) => html`
                          <li class="peers-row">
                            <i class="ph ph-users"></i>
                            <span class="peers-row-name">
                              ${peer.name || msg("Invitado")}
                            </span>
                          </li>
                        `,
                      )}
                    </ul>
                  </section>
                `,
              )}
            </div>
          `}
      </markal-modal>
    `;
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("markal-close", { bubbles: true, composed: true }),
    );
  };
}

customElements.define("markal-peers-modal", MarkalPeersModal);
