import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { VERBS } from "./commands/agent-context.ts";
import { CLI_VERBS } from "./cli.ts";

// frappe-ctl.skill.md is what `skills install` distributes to AI agents
// (ADR-021) — it must never fall behind the real verb set. "Fresh" means no
// verb missing or renamed; flags/examples stay curated, not exhaustive
// (ADR-025) — a skill file that mirrors --help 1:1 defeats its own
// token-efficiency purpose.
function skillFileVerbs(): Set<string> {
  const content = readFileSync(join(import.meta.dir, "..", "frappe-ctl.skill.md"), "utf8");
  const section = content.split("## Verb Reference")[1]?.split("## Token Efficiency")[0] ?? "";
  const verbs = new Set<string>();
  for (const match of section.matchAll(/^\| `([a-z-]+)` \|/gm)) {
    verbs.add(match[1]!);
  }
  return verbs;
}

// agent-context verb (not a DocType-scoped verb, but documented in the
// skill file's same table) is expected alongside every VERBS entry.
const EXPECTED_VERBS = new Set([...VERBS.map((v) => v.name), "agent-context"]);

describe("frappe-ctl.skill.md — verb freshness", () => {
  it("documents every verb the CLI actually has", () => {
    const documented = skillFileVerbs();
    const missing = [...EXPECTED_VERBS].filter((v) => !documented.has(v));
    expect(missing).toEqual([]);
  });

  it("doesn't document a stale verb the CLI no longer has", () => {
    const documented = skillFileVerbs();
    const stale = [...documented].filter((v) => !EXPECTED_VERBS.has(v));
    expect(stale).toEqual([]);
  });

  it("finds at least one verb — guards against the extraction itself silently matching nothing", () => {
    expect(skillFileVerbs().size).toBeGreaterThan(0);
  });
});

// Closes the chain: agent-context.ts::VERBS is what skill-file freshness is
// checked against above, but VERBS itself could drift from cli.ts's actual
// verb router without anything catching it. Cross-check both directions.
describe("agent-context.ts VERBS — matches cli.ts's actual verb router", () => {
  it("has no verb missing from CLI_VERBS", () => {
    const missing = [...EXPECTED_VERBS].filter((v) => !CLI_VERBS.includes(v));
    expect(missing).toEqual([]);
  });

  it("has no extra verb CLI_VERBS doesn't recognize", () => {
    const extra = CLI_VERBS.filter((v) => !EXPECTED_VERBS.has(v));
    expect(extra).toEqual([]);
  });
});
