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
