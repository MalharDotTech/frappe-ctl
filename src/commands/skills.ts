import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Chctl-inspired (ROADMAP.md, Functional bucket). Target dirs match
// clickhousectl's supported agent list — same convention, kept in sync
// manually since there's no shared registry between the two tools.
export const SKILL_AGENT_PATHS: Record<string, string> = {
  claude: ".claude/skills/",
  codex: ".codex/skills/",
  cursor: ".cursor/skills/",
  opencode: ".opencode/skills/",
  agent: ".agent/skills/",
  roo: ".roo/skills/",
  trae: ".trae/skills/",
  windsurf: ".windsurf/skills/",
  zencoder: ".zencoder/skills/",
  neovate: ".neovate/skills/",
  pochi: ".pochi/skills/",
  adal: ".adal/skills/",
  openclaw: ".openclaw/skills/",
  cline: ".cline/skills/",
  "command-code": ".command-code/skills/",
  "kiro-cli": ".kiro/skills/",
};

// Always installed regardless of agent selection.
export const COMMON_SKILL_PATH = ".agents/skills/";

// Agent Skills open standard (agentskills.io, adopted by Claude Code, Cursor,
// Codex, and dozens more): a skill is a directory named after the skill,
// containing SKILL.md with YAML frontmatter (name/description) — agents load
// only that frontmatter at startup, then the full body when the skill
// activates. A flat file does not get discovered (ADR-028) — confirmed
// against Claude Code's own docs and by installing via skills.sh's own CLI
// and inspecting its output before building this.
export const SKILL_NAME = "frappe-ctl";
const SOURCE_FILE_NAME = "SKILL.md";

function skillSourcePath(): string {
  return join(import.meta.dir, "..", "..", SOURCE_FILE_NAME);
}

// A detected agent = its own base config dir already exists in the target
// root (e.g. `.claude/`) — signal that the tool is actually in use there.
function agentBaseDir(relPath: string): string {
  return relPath.replace(/\/skills\/?$/, "");
}

function detectAgents(root: string): string[] {
  return Object.keys(SKILL_AGENT_PATHS).filter((agent) =>
    existsSync(join(root, agentBaseDir(SKILL_AGENT_PATHS[agent]!))),
  );
}

function installOne(root: string, relPath: string, content: string): string {
  const dir = join(root, relPath, SKILL_NAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = join(dir, SOURCE_FILE_NAME);
  writeFileSync(target, content, "utf8");
  return target;
}

export interface SkillsInstallOptions {
  agents?: string[];
  all?: boolean;
  detectedOnly?: boolean;
  global?: boolean;
  cwd?: string;
  home?: string;
}

export function cmdSkillsInstall(opts: SkillsInstallOptions): void {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? process.env["HOME"] ?? "~";
  const root = opts.global ? home : cwd;

  let targets: string[];
  if (opts.all) {
    targets = Object.keys(SKILL_AGENT_PATHS);
  } else if (opts.agents?.length) {
    for (const agent of opts.agents) {
      if (!SKILL_AGENT_PATHS[agent]) {
        throw new Error(
          `Unknown agent '${agent}'. Valid: ${Object.keys(SKILL_AGENT_PATHS).join(", ")}`,
        );
      }
    }
    targets = opts.agents;
  } else {
    // Default: --detected-only. Non-interactive tool, no prompts (ADR: agent-native principles) —
    // a sane default beats forcing every invocation to pick a scope.
    targets = detectAgents(root);
  }

  const content = readFileSync(skillSourcePath(), "utf8");
  const installedPaths: string[] = [];

  for (const agent of targets) {
    installedPaths.push(installOne(root, SKILL_AGENT_PATHS[agent]!, content));
  }
  installedPaths.push(installOne(root, COMMON_SKILL_PATH, content));

  for (const path of installedPaths) {
    console.log(`installed → ${path}`);
  }
  if (targets.length === 0) {
    console.log("No agent-specific dirs detected — installed to common path only. Use --all or --agent <name> to target specific agents.");
  }
}
