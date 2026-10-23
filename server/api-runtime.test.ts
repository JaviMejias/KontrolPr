// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("boots the compiled API with native Node ESM without a bundler or real credentials", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const output = mkdtempSync(join(tmpdir(), "kontrolpr-api-runtime-"));
  try {
    execFileSync(process.execPath, [join(root, "node_modules/typescript/lib/tsc.js"),
      "--project", join(root, "tsconfig.api.json"), "--noEmit", "false",
      "--rootDir", root, "--outDir", output, "--incremental",
      "--tsBuildInfoFile", join(output, "api.tsbuildinfo"),
    ], { cwd: root, encoding: "utf8", timeout: 30000 });
    writeFileSync(join(output, "package.json"), JSON.stringify({ type: "module" }));
    symlinkSync(join(root, "node_modules"), join(output, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const entry = pathToFileURL(join(output, "api/qa-team.js")).href;
    const script = `
      import assert from "node:assert/strict";
      globalThis.fetch = async (url) => {
        assert.equal(url, "https://api.bitbucket.org/2.0/user");
        return Response.json({ uuid: "{22222222-2222-4222-8222-222222222222}" });
      };
      const { default: api } = await import(${JSON.stringify(entry)});
      const unauthorized = await api.fetch(new Request("https://kontrolpr.test/api/qa-team"));
      assert.equal(unauthorized.status, 401);
      assert.equal((await unauthorized.json()).code, "unauthorized");
      const authorization = "Basic " + Buffer.from("test@example.com:synthetic-only").toString("base64");
      const unconfigured = await api.fetch(new Request("https://kontrolpr.test/api/qa-team", { headers: { Authorization: authorization } }));
      assert.equal(unconfigured.status, 503);
      assert.equal((await unconfigured.json()).code, "not_configured");
      console.log("Native ESM: unauthorized and unconfigured responses verified");
    `;
    const result = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: output, env: { ...process.env, BLOB_READ_WRITE_TOKEN: "" }, encoding: "utf8", timeout: 10000,
    });
    expect(result).toContain("Native ESM: unauthorized and unconfigured responses verified");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 45000);
