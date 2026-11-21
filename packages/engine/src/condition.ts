/**
 * Condition expressions.
 *
 *   expr   := or
 *   or     := and ("|" and)*
 *   and    := unary ("&" unary)*
 *   unary  := "!" unary | "(" or ")" | atom
 *   atom   := ident (("=" | "~") ident)?
 *   ident  := [A-Za-z0-9_@.-]+
 *
 * `q` is true when boolean question q is answered true; `q=opt` when choice
 * question q is answered opt; `q~opt` when multi question q includes opt.
 * Identifiers starting with `@` are built-in flags supplied by the context.
 * Unanswered questions make atoms false.
 */

import type { Answer } from "./types.ts";

export type Expr =
  | { op: "or" | "and"; args: Expr[] }
  | { op: "not"; arg: Expr }
  | { op: "is"; q: string }
  | { op: "eq" | "has"; q: string; v: string }
  | { op: "flag"; name: string };

export class ConditionError extends Error {}

const cache = new Map<string, Expr>();

export function parseCondition(src: string): Expr {
  const hit = cache.get(src);
  if (hit) return hit;
  const tokens = src.match(/[A-Za-z0-9_@.-]+|[!&|()=~]|\S/g) ?? [];
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const take = (): string => {
    const t = tokens[i++];
    if (t === undefined) throw new ConditionError(`unexpected end of condition: ${src}`);
    return t;
  };
  const isIdent = (t: string | undefined): t is string => !!t && /^[A-Za-z0-9_@.-]+$/.test(t);

  function or(): Expr {
    const args = [and()];
    while (peek() === "|") {
      take();
      args.push(and());
    }
    return args.length === 1 ? args[0]! : { op: "or", args };
  }
  function and(): Expr {
    const args = [unary()];
    while (peek() === "&") {
      take();
      args.push(unary());
    }
    return args.length === 1 ? args[0]! : { op: "and", args };
  }
  function unary(): Expr {
    const t = peek();
    if (t === "!") {
      take();
      return { op: "not", arg: unary() };
    }
    if (t === "(") {
      take();
      const e = or();
      if (take() !== ")") throw new ConditionError(`expected ")" in condition: ${src}`);
      return e;
    }
    const id = take();
    if (!isIdent(id)) throw new ConditionError(`unexpected "${id}" in condition: ${src}`);
    if (id.startsWith("@")) return { op: "flag", name: id.slice(1) };
    const nx = peek();
    if (nx === "=" || nx === "~") {
      take();
      const v = take();
      if (!isIdent(v)) throw new ConditionError(`expected option id after "${nx}": ${src}`);
      return { op: nx === "=" ? "eq" : "has", q: id, v };
    }
    return { op: "is", q: id };
  }

  const e = or();
  if (i !== tokens.length) throw new ConditionError(`trailing tokens in condition: ${src}`);
  cache.set(src, e);
  return e;
}

export interface EvalContext {
  answers: Record<string, Answer>;
  flags: Record<string, boolean>;
}

export function evaluate(e: Expr, ctx: EvalContext): boolean {
  switch (e.op) {
    case "or":
      return e.args.some((a) => evaluate(a, ctx));
    case "and":
      return e.args.every((a) => evaluate(a, ctx));
    case "not":
      return !evaluate(e.arg, ctx);
    case "is":
      return ctx.answers[e.q] === true;
    case "eq":
      return ctx.answers[e.q] === e.v;
    case "has": {
      const a = ctx.answers[e.q];
      return Array.isArray(a) && a.includes(e.v);
    }
    case "flag":
      return ctx.flags[e.name] === true;
  }
}

export function evalCondition(src: string, ctx: EvalContext): boolean {
  return evaluate(parseCondition(src), ctx);
}

/** Question ids an expression refers to (with the option ids it tests). */
export function conditionRefs(src: string): { q: string; v?: string; kind: "is" | "eq" | "has" }[] {
  const out: { q: string; v?: string; kind: "is" | "eq" | "has" }[] = [];
  const walk = (e: Expr): void => {
    switch (e.op) {
      case "or":
      case "and":
        e.args.forEach(walk);
        return;
      case "not":
        walk(e.arg);
        return;
      case "is":
        out.push({ q: e.q, kind: "is" });
        return;
      case "eq":
      case "has":
        out.push({ q: e.q, v: e.v, kind: e.op });
        return;
      case "flag":
        return;
    }
  };
  walk(parseCondition(src));
  return out;
}

export function conditionFlags(src: string): string[] {
  const out: string[] = [];
  const walk = (e: Expr): void => {
    if (e.op === "flag") out.push(e.name);
    else if (e.op === "or" || e.op === "and") e.args.forEach(walk);
    else if (e.op === "not") walk(e.arg);
  };
  walk(parseCondition(src));
  return out;
}
