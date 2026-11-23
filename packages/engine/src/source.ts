/**
 * Source mode: re-emit the official markup with no choices applied.
 *
 * Used only by the round-trip test: `renderSource(template)` must equal the
 * normalized official text of the instruction, paragraph for paragraph and
 * character for character.
 */

import { BLANK, canonicalSource } from "./text.ts";
import type {
  Block,
  Element,
  ElementItem,
  Inline,
  InlineNode,
  Template,
  Unbalanced,
} from "./types.ts";
import { isElement, isGroup, isNoteItem, toInlines } from "./walk.ts";

export function renderSource(t: Template): string[] {
  return blocks(t.body).map(canonicalSource);
}

function inlines(xs: Inline[] | string): string {
  return toInlines(xs).map(inline).join("");
}

function inline(n: Inline): string {
  if (typeof n === "string") return n;
  return renderInlineSource(n);
}

export function renderInlineSource(n: InlineNode): string {
  if ("em" in n) return `*${inlines(n.em)}*`;
  if ("field" in n) {
    if (n.noBlank) return `<${n.hint ?? ""}>`;
    return n.hint !== undefined ? `${BLANK} <${n.hint}>` : BLANK;
  }
  if ("opt" in n) return wrap("[", inlines(n.opt), "]", n);
  if ("options" in n) {
    const alts = n.options.map(inlines).join("/");
    return "bare" in n && n.bare ? alts : wrap("(", alts, ")", n);
  }
  if ("sep" in n) return `[${n.sep}]`;
  if ("pronoun" in n) return n.bare ? n.forms.join("/") : `(${n.forms.join("/")})`;
  if ("agree" in n) return n.alt ? `(${n.sg}/${n.pl})` : n.sg;
  if ("note" in n) return `<${n.note}>`;
  if ("erratum" in n) return n.printed ?? "";
  const never: never = n;
  throw new Error(`unknown inline node ${JSON.stringify(never)}`);
}

/** Wrap in brackets, leaving out any the official text doesn't print (errata). */
function wrap(open: string, s: string, close: string, u: Unbalanced): string {
  return (u.unopened ? "" : open) + s + (u.unclosed ? "" : close);
}

function blocks(bs: Block[]): string[] {
  return bs.flatMap(block);
}

function block(b: Block): string[] {
  if (typeof b === "string" || Array.isArray(b)) return [inlines(b)];
  if ("p" in b) return [inlines(b.p)];
  if ("bullet" in b) return [`• ${inlines(b.bullet)}`];
  if ("note" in b) return [`<${b.note}>`];
  if ("opt" in b) return bracket(blocks(b.opt), b);
  if ("elements" in b) return b.elements.flatMap(elementItem);
  const never: never = b;
  throw new Error(`unknown block ${JSON.stringify(never)}`);
}

function bracket(paras: string[], u: Unbalanced = {}): string[] {
  if (paras.length === 0) return [wrap("[", "", "]", u)];
  const out = paras.slice();
  if (!u.unopened) out[0] = "[" + out[0]!;
  if (!u.unclosed) out[out.length - 1] = out[out.length - 1]! + "]";
  return out;
}

function elementItem(it: ElementItem): string[] {
  if (isNoteItem(it)) return [`<${it.note}>`];
  if (isElement(it)) return element(it);
  if (isGroup(it)) {
    const lines = it.options.flatMap((o, i) => [
      ...(i > 0 && it.or !== undefined ? [it.or] : []),
      ...(o.note !== undefined ? [`<${o.note}>`] : []),
      ...bracket(o.elements.flatMap(element), o),
    ]);
    if (it.if !== undefined && it.andOutside && it.and !== undefined)
      return [it.and, ...bracket(lines, it)];
    const paras = it.and !== undefined ? [it.and, ...lines] : lines;
    return it.if !== undefined ? bracket(paras, it) : paras;
  }
  throw new Error(`unknown element item ${JSON.stringify(it)}`);
}

function element(e: Element): string[] {
  const line = `${e.n}. ${inlines(e.text)}${e.end}`;
  const note = e.note !== undefined ? [`<${e.note}>`] : [];
  if (e.andOutside && e.and !== undefined) return [e.and, ...note, ...bracket([line], e)];
  const paras = e.and !== undefined ? [e.and, ...note, line] : [...note, line];
  return e.if !== undefined ? bracket(paras, e) : paras;
}
