import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Regression test for a real bug: `npm install -g frappe-ctl` always
// symlinks the bin into a global bin dir (e.g.
// ~/.npm-global/bin/frappe-ctl -> .../lib/node_modules/frappe-ctl/bin/frappe-ctl).
// The wrapper previously resolved its own location with `dirname "$0"`,
// which doesn't follow symlinks — it looked for src/cli.ts next to the
// symlink's directory instead of the real script's directory. Verified
// against a real `npm pack` + global install before fixing, not just a
// manual symlink.

const BIN_PATH = join(import.meta.dir, "..", "bin", "frappe-ctl");
let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function runBin(path: string): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([path, "--version"]);
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

describe("bin/frappe-ctl — symlink resolution", () => {
  it("runs correctly when invoked directly (no symlink)", () => {
    const result = runBin(BIN_PATH);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runs correctly when invoked through a symlink (simulates npm global install)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "fctl-bin-symlink-"));
    const linkPath = join(tmpDir, "frappe-ctl");
    symlinkSync(BIN_PATH, linkPath);
    chmodSync(linkPath, 0o755);

    const result = runBin(linkPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runs correctly through a symlink under a different name (fctl alias)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "fctl-bin-symlink-"));
    const linkPath = join(tmpDir, "fctl");
    symlinkSync(BIN_PATH, linkPath);
    chmodSync(linkPath, 0o755);

    const result = runBin(linkPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
