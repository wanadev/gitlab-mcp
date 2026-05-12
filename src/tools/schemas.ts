import { z } from "zod";

// Certains clients MCP serialisent les numbers/booleans en string avant la
// validation Zod (cf. issue #38). On expose ici des helpers qui acceptent la
// forme string et la coercent vers le type attendu.

/** z.number() tolerant aux strings numeriques ("166" -> 166). */
export const idNumber = () => z.coerce.number();

/**
 * z.boolean() tolerant aux strings. z.coerce.boolean() n'est pas utilisable
 * directement : en JS, Boolean("false") === true. On fait donc un preprocess
 * explicite sur les valeurs string connues.
 */
export const flagBool = () =>
  z.preprocess((v) => {
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0" || s === "") return false;
    }
    return v;
  }, z.boolean());

export const dryRunSchema = flagBool()
  .default(true)
  .describe(
    "Dry run mode (default: true). When true, returns a preview of the action without executing it. Set to false only after user confirmation."
  );

// ---------------------------------------------------------------------------
// Escape-sequence heuristic (issue #43)
//
// LLMs sometimes double-escape strings, sending literal "\n" (backslash + n)
// instead of real newlines. GitLab stores the literal characters verbatim and
// the issue/epic renders broken. We surface a non-blocking warning when a
// field contains the literal sequence but no real counterpart.
// ---------------------------------------------------------------------------

const ESCAPE_CHECKS: { token: string; needs: string; label: string }[] = [
  { token: "\\n", needs: "\n", label: '"\\n"' },
  { token: "\\t", needs: "\t", label: '"\\t"' },
  { token: "\\r", needs: "\r", label: '"\\r"' },
];

export function detectEscapeIssues(fields: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.length === 0) continue;
    for (const check of ESCAPE_CHECKS) {
      if (value.includes(check.token) && !value.includes(check.needs)) {
        warnings.push(
          `⚠ ${name} contains literal ${check.label} with no real ${check.label.replace(/"/g, "")} character — looks like a double-escape bug. Replace the literal sequence with a real newline/tab before re-sending.`,
        );
        break;
      }
    }
  }
  return warnings;
}

export function formatWarnings(warnings: string[]): string {
  return warnings.length === 0 ? "" : `\n\n${warnings.join("\n")}`;
}

export function appendEscapeWarnings(text: string, fields: Record<string, unknown>): string {
  return `${text}${formatWarnings(detectEscapeIssues(fields))}`;
}
