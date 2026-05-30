import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";

export class MarkalPrivacy extends LitElement {
  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  createRenderRoot() {
    return this; // Light DOM to inherit global styles
  }

  render() {
    return html`
      <article>
        <h1>${msg("Política de privacidad")}</h1>
        <p class="meta">${msg("Última actualización: 23 de mayo de 2026")}</p>

        <p class="lead">
          ${msg(
            "Markal no almacena tus calendarios en servidores centrales. Tus datos viven solo en tu navegador. Esta página describe los detalles.",
          )}
        </p>

        <h2>${msg("Qué se almacena en tu dispositivo")}</h2>
        <ul>
          <li>
            ${msg(
              html`<strong>Calendarios, leyendas y marcas:</strong> en el almacenamiento local (IndexedDB) de tu navegador.`,
            )}
          </li>
          <li>
            ${msg(
              html`<strong>Preferencias de la app</strong> (idioma, estado del sidebar): en <code>localStorage</code> del navegador.`,
            )}
          </li>
        </ul>

        <h2>${msg("Lo que no hacemos")}</h2>
        <ul>
          <li>
            ${msg("No tenemos cuentas de usuario ni base de datos central de calendarios.")}
          </li>
          <li>${msg("No usamos cookies de seguimiento ni analytics.")}</li>
          <li>
            ${msg("No vendemos, alquilamos ni compartimos información con terceros.")}
          </li>
        </ul>

        <h2>${msg("Compartir calendarios entre dispositivos")}</h2>
        <p>
          ${msg(
            html`Cuando compartes un calendario, los datos viajan directamente entre los navegadores de los participantes vía WebRTC, cifrados de extremo a extremo con AES-GCM-256. La clave de cifrado viaja en el fragmento (<code>#</code>) del enlace de invitación, que por diseño nunca llega al servidor.`,
          )}
        </p>
        <p>
          ${msg(
            "Un servidor de señalización propio media el handshake inicial WebRTC. Solo ve identificadores de sala opacos y direcciones IP necesarias para conectar peers; nunca ve el contenido de tus calendarios.",
          )}
        </p>

        <h2>${msg("Tus derechos")}</h2>
        <ul>
          <li>
            ${msg(
              html`<strong>Acceso:</strong> todos tus datos están en tu navegador; puedes inspeccionarlos con las DevTools.`,
            )}
          </li>
          <li>
            ${msg(
              html`<strong>Eliminación:</strong> borrar el storage del sitio en tu navegador elimina toda la información local.`,
            )}
          </li>
          <li>
            ${msg(
              html`<strong>Portabilidad:</strong> Markal incluye export/import a archivo, con opción de cifrarlo con tu contraseña.`,
            )}
          </li>
        </ul>

        <h2>${msg("Cambios a esta política")}</h2>
        <p>
          ${msg(
            "Si esta política cambia, lo reflejaremos en esta misma página con su fecha de actualización. Markal es software de código abierto y los cambios quedan en el historial público del repositorio.",
          )}
        </p>

        <h2>${msg("Contacto")}</h2>
        <p>
          ${msg(
            html`¿Preguntas o solicitudes relacionadas con privacidad? Escribe a <a href="mailto:adriandomc@gmail.com">adriandomc@gmail.com</a>.`,
          )}
        </p>
      </article>
    `;
  }
}

customElements.define("markal-privacy", MarkalPrivacy);
