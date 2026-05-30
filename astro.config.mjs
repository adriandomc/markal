import { defineConfig } from "astro/config";
import lit from "@astrojs/lit";
import node from "@astrojs/node";

export default defineConfig({
  integrations: [lit()],
  adapter: node({ mode: "middleware" }),
  output: "server",
  server: {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 5173),
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/dist/**"],
      },
    },
  },
});
