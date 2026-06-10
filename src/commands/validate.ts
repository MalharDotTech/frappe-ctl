import { FrappeClient } from "../client.ts";

interface ValidateArgs {
  doctype: string;
  data: Record<string, unknown>;
  outputJson?: boolean;
}

interface FrappeField {
  fieldname: string;
  fieldtype: string;
  reqd: number;
}

export async function cmdValidate(client: FrappeClient, args: ValidateArgs): Promise<void> {
  const meta = await client.getDocTypeMeta(args.doctype) as { fields?: FrappeField[] };
  const fields = (meta.fields ?? []).filter(
    (f) => f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break" && f.fieldtype !== "Tab Break",
  );

  const requiredFields = fields.filter((f) => f.reqd === 1).map((f) => f.fieldname);
  const allFieldNames = new Set(fields.map((f) => f.fieldname));
  const dataKeys = Object.keys(args.data);

  const missing = requiredFields.filter(
    (f) => !(f in args.data) || args.data[f] === null || args.data[f] === undefined || args.data[f] === "",
  );
  const unknown = dataKeys.filter((k) => !allFieldNames.has(k));

  if (missing.length === 0 && unknown.length === 0) {
    if (args.outputJson) {
      process.stdout.write(JSON.stringify({ valid: true, required: requiredFields }) + "\n");
    } else {
      console.log("OK: all required fields present");
      if (requiredFields.length > 0) {
        console.log(`Required: ${requiredFields.join(", ")}`);
      }
    }
    return;
  }

  if (args.outputJson) {
    const unknownWithSuggestions = unknown.map((uk) => ({
      field: uk,
      suggestion: findClosest(uk, Array.from(allFieldNames)),
    }));
    process.stdout.write(
      JSON.stringify({ valid: false, required: requiredFields, missing, unknown: unknownWithSuggestions }) + "\n",
    );
    process.exit(1);
  }

  if (missing.length > 0) {
    console.error(`MISSING: ${missing.join(", ")}`);
  }
  for (const uk of unknown) {
    const suggestion = findClosest(uk, Array.from(allFieldNames));
    if (suggestion) {
      console.error(`UNKNOWN FIELD: ${uk} (did you mean: ${suggestion}?)`);
    } else {
      console.error(`UNKNOWN FIELD: ${uk}`);
    }
  }
  process.exit(1);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function findClosest(target: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = 3; // suggest only if edit distance ≤ 2
  for (const c of candidates) {
    const d = levenshtein(target, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
