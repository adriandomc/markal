import { html, LitElement } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";

export class MarkalSiteFooter extends LitElement {
  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  // Deshabilita el Shadow DOM para que la clase "site-footer" 
  // en el componente principal de index.astro lo pueda estilar si se usa como tag,
  // o simplemente heredamos los estilos globales.
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <footer class="site-footer">
        <a href="/privacy" rel="privacy-policy">
          ${msg("Política de privacidad")}
        </a>
        <a
          href="https://github.com/adriandomc/markal"
          target="_blank"
          rel="noopener noreferrer"
        >GitHub</a>
      </footer>
    `;
  }
}

customElements.define("markal-site-footer", MarkalSiteFooter);
