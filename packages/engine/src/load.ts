import { parse } from "yaml";
import type { Template } from "./types.ts";

/**
 * Parse an authored YAML template into its JSON form. No custom tags or
 * anchors are needed; YAML here is only a friendlier spelling of the JSON.
 * Validate the result with `validateTemplate` before use.
 */
export function parseTemplateYaml(text: string): Template {
  return parse(text, { strict: true, uniqueKeys: true, merge: false }) as Template;
}
