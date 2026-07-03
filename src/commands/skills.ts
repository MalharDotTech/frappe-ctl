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

// SKILL.md (repo root) is the single canonical source — carries YAML
// frontmatter for skills.sh discovery (ADR-027). Installed copies keep the
// frappe-ctl.skill.md name deliberately: agent skills dirs are shared across
// tools, and a generically-named SKILL.md installed flat there would collide
// with any other tool that names its own file the same way.
const SOURCE_FILE_NAME = "SKILL.md";
const INSTALLED_FILE_NAME = "frappe-ctl.skill.md";

function skillSourcePath(): string {
  return join(import.meta.dir, "..", "..", SOURCE_FILE_NAME);
}

// Frontmatter is metadata for skills.sh discovery, not operator content —
// installed copies stay exactly as frappe-ctl.skill.md always looked.
function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "");
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
  const dir = join(root, relPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = join(dir, INSTALLED_FILE_NAME);
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

  const content = stripFrontmatter(readFileSync(skillSourcePath(), "utf8"));
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
