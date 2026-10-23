import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { qaTeamApiPlugin } from "./server/vite-api";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), qaTeamApiPlugin(loadEnv(mode, process.cwd(), "BLOB_READ_WRITE_TOKEN").BLOB_READ_WRITE_TOKEN), {
    name: "kontrolpr-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const template = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");
        const assets = ["/index.html", "/favicon.svg", "/manifest.webmanifest", ...Object.keys(bundle).filter((name) => name.startsWith("assets/")).map((name) => `/${name}`)];
        const hash = createHash("sha256").update(template);
        for (const name of Object.keys(bundle).sort()) {
          const output = bundle[name];
          hash.update(name).update(output.type === "chunk" ? output.code : output.source);
        }
        this.emitFile({ type: "asset", fileName: "sw.js", source: template.replace("__BUILD_VERSION__", hash.digest("hex").slice(0, 16)).replace("__PRECACHE_ASSETS__", JSON.stringify(assets)) });
      },
    },
  }],
  build: {
    target: "es2022",
  },
}));
