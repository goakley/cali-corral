/**
 * Template validation: JSON Schema (structure) plus semantic checks that a
 * schema can't express (references, option counts, derivable pronouns).
 */

import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../schema/template.schema.json" with { type: "json" };
import { ConditionError, conditionFlags, conditionRefs, parseCondition } from "./condition.ts";
import { theyForm } from "./pronouns.ts";
import { DEFAULT_FLAGS } from "./render.ts";
import type { Block, Inline, InlineNode, Question, Template } from "./types.ts";
import { isElement, isGroup, isNoteItem, toInlines } from "./walk.ts";

export interface ValidationIssue {
  path: string;
  message: string;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
});
const validateSchema = ajv.compile(schema);

export function validateTemplate(t: unknown): ValidationIssue[] {
  if (!validateSchema(t)) {
    return (validateSchema.errors ?? []).map((e) => ({
      path: e.instancePath || "/",
      message: `${e.message ?? "invalid"}${e.params ? " " + JSON.stringify(e.params) : ""}`,
    }));
  }
  return semanticIssues(t as unknown as Template);
}

export function semanticIssues(t: Template): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const questions = new Map<string, Question>();
  (t.questions ?? []).forEach((q, i) => {
    if (questions.has(q.id)) add(`/questions/${i}`, `duplicate question id "${q.id}"`);
    questions.set(q.id, q);
    if (q.type === "choice" && q.articleFor !== undefined) {
      const labels = q.options
        .map((o) => o.label.toLowerCase())
        .sort()
        .join("/");
      if (labels !== "a/an")
        add(`/questions/${i}`, `articleFor needs options labeled "a" and "an"`);
      if (
        !/^(count|text\.[a-z][a-z0-9_]*|[a-z][a-z0-9_]*\.(name|title|agency))$/.test(q.articleFor)
      ) {
        add(`/questions/${i}`, `articleFor "${q.articleFor}" is not a field path`);
      }
    }
    if (q.type !== "boolean") {
      const ids = new Set<string>();
      for (const o of q.options) {
        if (ids.has(o.id)) add(`/questions/${i}`, `duplicate option id "${o.id}"`);
        ids.add(o.id);
      }
    }
  });
  const roles = new Set(["defendant", ...Object.keys(t.people ?? {})]);
  const used = new Set<string>();

  function checkCondition(src: string, path: string): void {
    try {
      parseCondition(src);
    } catch (e) {
      add(path, e instanceof ConditionError ? e.message : String(e));
      return;
    }
    for (const f of conditionFlags(src)) {
      if (!(f in DEFAULT_FLAGS)) add(path, `unknown flag "@${f}"`);
    }
    for (const r of conditionRefs(src)) {
      used.add(r.q);
      const q = questions.get(r.q);
      if (!q) {
        add(path, `condition refers to unknown question "${r.q}"`);
        continue;
      }
      if (r.kind === "is" && q.type !== "boolean") {
        add(
          path,
          `"${r.q}" is a ${q.type} question; test it with ${q.type === "choice" ? "=" : "~"}option`,
        );
      }
      if (r.kind === "eq" && q.type !== "choice") add(path, `"${r.q}=..." needs a choice question`);
      if (r.kind === "has" && q.type !== "multi") add(path, `"${r.q}~..." needs a multi question`);
      if (r.kind === "count" && q.type !== "multi") add(path, `"${r.q}>n" needs a multi question`);
      if (
        (r.kind === "eq" || r.kind === "has") &&
        q.type !== "boolean" &&
        !q.options.some((o) => o.id === r.v)
      ) {
        add(path, `question "${r.q}" has no option "${r.v}"`);
      }
    }
  }

  function checkRole(role: string, path: string): void {
    if (!roles.has(role)) add(path, `unknown person role "${role}" (declare it under people)`);
  }

  function walkInlines(xs: Inline[] | string, path: string, inAny: boolean): void {
    toInlines(xs).forEach((x, i) => {
      if (typeof x !== "string") walkNode(x, `${path}/${i}`, inAny);
    });
  }

  function walkNode(n: InlineNode, path: string, inAny: boolean): void {
    if ("em" in n) return walkInlines(n.em, `${path}/em`, inAny);
    if ("field" in n) {
      const role = n.field.split(".")[0]!;
      if (n.field !== "count" && role !== "text") checkRole(role, path);
      return;
    }
    if ("opt" in n) {
      checkCondition(n.if, `${path}/if`);
      return walkInlines(n.opt, `${path}/opt`, inAny);
    }
    if ("any" in n) {
      used.add(n.any);
      const q = questions.get(n.any);
      if (!q) add(path, `unknown question "${n.any}"`);
      else if (q.type !== "multi") add(path, `"${n.any}" must be a multi question`);
      else if (q.options.length !== n.options.length) {
        add(
          path,
          `"${n.any}" has ${q.options.length} options but the node has ${n.options.length}`,
        );
      }
      n.options.forEach((o, i) => walkInlines(o, `${path}/options/${i}`, true));
      return;
    }
    if ("options" in n) {
      if (n.choice !== undefined) {
        used.add(n.choice);
        const q = questions.get(n.choice);
        if (!q) add(path, `unknown question "${n.choice}"`);
        else if (q.type !== "choice") add(path, `"${n.choice}" must be a choice question`);
        else if (q.options.length !== n.options.length) {
          add(
            path,
            `"${n.choice}" has ${q.options.length} options but the node has ${n.options.length}`,
          );
        }
      } else if (n.when !== undefined) {
        if (n.when.length !== n.options.length) add(path, `"when" needs one condition per option`);
        n.when.forEach((c, i) => checkCondition(c, `${path}/when/${i}`));
      }
      n.options.forEach((o, i) => walkInlines(o, `${path}/options/${i}`, inAny));
      return;
    }
    if ("sep" in n) {
      if (!inAny) add(path, `[${n.sep}] connector must be inside an "any" node`);
      return;
    }
    if ("pronoun" in n) {
      checkRole(n.pronoun, path);
      if (theyForm(n.forms) === undefined)
        add(path, `can't derive a they-form for (${n.forms.join("/")})`);
      return;
    }
    if ("agree" in n) {
      if (n.onlyIf !== undefined) checkCondition(n.onlyIf, `${path}/onlyIf`);
      return checkRole(n.agree, path);
    }
    if ("note" in n) {
      for (const g of n.governs ?? [])
        if (!questions.has(g)) add(path, `note governs unknown question "${g}"`);
      return;
    }
  }

  function walkBlocks(bs: Block[], path: string): void {
    bs.forEach((b, i) => {
      const p = `${path}/${i}`;
      if (typeof b === "string" || Array.isArray(b)) return walkInlines(b, p, false);
      if ("p" in b) return walkInlines(b.p, `${p}/p`, false);
      if ("bullet" in b) return walkInlines(b.bullet, `${p}/bullet`, false);
      if ("note" in b) {
        for (const g of b.governs ?? [])
          if (!questions.has(g)) add(p, `note governs unknown question "${g}"`);
        return;
      }
      if ("opt" in b) {
        checkCondition(b.if, `${p}/if`);
        return walkBlocks(b.opt, `${p}/opt`);
      }
      if ("elements" in b) {
        if (b.plain) {
          b.elements.forEach((it, j) => {
            if (isElement(it) && it.and !== undefined)
              add(`${p}/elements/${j}`, "a plain list has no conjunctions");
          });
        }
        b.elements.forEach((it, j) => {
          const ep = `${p}/elements/${j}`;
          if (isNoteItem(it)) {
            for (const g of it.governs ?? [])
              if (!questions.has(g)) add(ep, `note governs unknown question "${g}"`);
          } else if (isElement(it)) {
            if (it.if !== undefined) checkCondition(it.if, `${ep}/if`);
            walkInlines(it.text, `${ep}/text`, false);
          } else if (isGroup(it)) {
            used.add(it.alt);
            const q = questions.get(it.alt);
            if (!q) add(ep, `unknown question "${it.alt}"`);
            else if (q.type === "boolean")
              add(ep, `"${it.alt}" must be a choice or multi question`);
            else if (q.options.length !== it.options.length) {
              add(
                ep,
                `"${it.alt}" has ${q.options.length} options but the group has ${it.options.length}`,
              );
            }
            if (q?.type === "multi" && it.or === undefined)
              add(ep, `a multi-choice group needs an "or" conjunction`);
            if (j === b.elements.length - 1)
              add(ep, "an alternative group can't be the last element");
            it.options.forEach((o, k) =>
              o.elements.forEach((e, m) => {
                if (e.if !== undefined || e.and !== undefined) {
                  add(`${ep}/options/${k}/elements/${m}`, "elements in a group can't have if/and");
                }
                walkInlines(e.text, `${ep}/options/${k}/elements/${m}/text`, false);
              }),
            );
          }
        });
      }
    });
  }

  walkBlocks(t.body, "/body");
  for (const q of questions.keys()) {
    if (!used.has(q)) add("/questions", `question "${q}" is never used`);
  }
  return issues;
}
