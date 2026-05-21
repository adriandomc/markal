import type { APIRoute } from "astro";
import { chromium } from "playwright";
import { renderExportHtml } from "../../../lib/export-template.ts";
import type { ExportPayload } from "../../../types.ts";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const format = params.format;
  if (format !== "png" && format !== "pdf") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const payload = (await request.json()) as ExportPayload;
    const html = await renderExportHtml(payload.document);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1131 },
        deviceScaleFactor: 2,
      });

      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      if (format === "png") {
        const image = await page.locator(".sheet").screenshot({ type: "png" });
        return new Response(new Uint8Array(image), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
          },
        });
      }

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
      });

      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return new Response(message, { status: 500 });
  }
};
