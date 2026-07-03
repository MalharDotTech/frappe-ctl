import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { cmdSkillsInstall, SKILL_AGENT_PATHS, COMMON_SKILL_PATH } from "./skills.ts";

let cwd: string;
let home: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "fctl-skills-cwd-"));
  home = mkdtempSync(join(tmpdir(), "fctl-skills-home-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function installed(root: string, relPath: string): boolean {
  return existsSync(join(root, relPath, "frappe-ctl.skill.md"));
}

// SKILL.md (canonical source, ADR-027) carries YAML frontmatter that
// installed copies deliberately don't — strip it the same way skills.ts does.
function canonicalInstalledContent(): string {
  const raw = readFileSync(join(import.meta.dir, "..", "..", "SKILL.md"), "utf8");
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "");
}

describe("cmdSkillsInstall — --all", () => {
  it("installs into every supported agent path plus the common path", () => {
    cmdSkillsInstall({ all: true, cwd, home });
    for (const relPath of Object.values(SKILL_AGENT_PATHS)) {
      expect(installed(cwd, relPath)).toBe(true);
    }
    expect(installed(cwd, COMMON_SKILL_PATH)).toBe(true);
  });

  it("writes content identical to SKILL.md with frontmatter stripped", () => {
    cmdSkillsInstall({ all: true, cwd, home });
    const written = readFileSync(join(cwd, SKILL_AGENT_PATHS["claude"]!, "frappe-ctl.skill.md"), "utf8");
    expect(written).toBe(canonicalInstalledContent());
  });
});

describe("cmdSkillsInstall — --agent (repeatable)", () => {
  it("installs only the named agents plus the common path", () => {
    cmdSkillsInstall({ agents: ["claude", "codex"], cwd, home });
    expect(installed(cwd, SKILL_AGENT_PATHS["claude"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["codex"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["cursor"]!)).toBe(false);
    expect(installed(cwd, COMMON_SKILL_PATH)).toBe(true);
  });

  it("throws a descriptive error for an unknown agent name", () => {
    expect(() => cmdSkillsInstall({ agents: ["not-a-real-agent"], cwd, home })).toThrow("not-a-real-agent");
  });
});

describe("cmdSkillsInstall — --detected-only", () => {
  it("installs only into agent dirs that already exist", () => {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    mkdirSync(join(cwd, ".cursor"), { recursive: true });
    cmdSkillsInstall({ detectedOnly: true, cwd, home });
    expect(installed(cwd, SKILL_AGENT_PATHS["claude"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["cursor"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["codex"]!)).toBe(false);
    // Common path always included, even with nothing detected
    expect(installed(cwd, COMMON_SKILL_PATH)).toBe(true);
  });

  it("installs only the common path when nothing is detected", () => {
    cmdSkillsInstall({ detectedOnly: true, cwd, home });
    for (const relPath of Object.values(SKILL_AGENT_PATHS)) {
      expect(installed(cwd, relPath)).toBe(false);
    }
    expect(installed(cwd, COMMON_SKILL_PATH)).toBe(true);
  });
});

describe("cmdSkillsInstall — default behavior (no flags)", () => {
  it("behaves like --detected-only when no scope flag is passed", () => {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    cmdSkillsInstall({ cwd, home });
    expect(installed(cwd, SKILL_AGENT_PATHS["claude"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["codex"]!)).toBe(false);
  });
});

describe("cmdSkillsInstall — --global", () => {
  it("installs into home dir instead of cwd", () => {
    cmdSkillsInstall({ agents: ["claude"], global: true, cwd, home });
    expect(installed(home, SKILL_AGENT_PATHS["claude"]!)).toBe(true);
    expect(installed(cwd, SKILL_AGENT_PATHS["claude"]!)).toBe(false);
  });
});

describe("cmdSkillsInstall — idempotency", () => {
  it("running twice does not throw and leaves content correct", () => {
    cmdSkillsInstall({ agents: ["claude"], cwd, home });
    expect(() => cmdSkillsInstall({ agents: ["claude"], cwd, home })).not.toThrow();
    expect(installed(cwd, SKILL_AGENT_PATHS["claude"]!)).toBe(true);
  });

  it("overwrites stale content on reinstall", () => {
    const target = join(cwd, SKILL_AGENT_PATHS["claude"]!, "frappe-ctl.skill.md");
    mkdirSync(join(cwd, SKILL_AGENT_PATHS["claude"]!), { recursive: true });
    writeFileSync(target, "stale content", "utf8");
    cmdSkillsInstall({ agents: ["claude"], cwd, home });
    expect(readFileSync(target, "utf8")).toBe(canonicalInstalledContent());
  });
});
