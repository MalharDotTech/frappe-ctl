import { spyOn } from "bun:test";

/**
 * Captures both console.log and process.stdout.write output.
 * JSON output uses process.stdout.write directly (Bun flush fix, ADR-013).
 * Table/CSV output uses console.log.
 * Use this helper when a test needs to capture either path.
 */
export function captureOutput(): {
  lines: string[];
  restore: () => void;
} {
  const lines: string[] = [];

  const consoleSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });

  const writeSpy = spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
    if (typeof chunk === "string") lines.push(chunk.trimEnd());
    return true;
  });

  return {
    lines,
    restore: () => {
      consoleSpy.mockRestore();
      writeSpy.mockRestore();
    },
  };
}
