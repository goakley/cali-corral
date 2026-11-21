import type { Element, ElementItem, Inline, NoteBlock } from "./types.ts";

export function toInlines(xs: Inline[] | string): Inline[] {
  return typeof xs === "string" ? [xs] : xs;
}

export function isNoteItem(it: ElementItem): it is NoteBlock {
  return "note" in it && !("text" in it);
}

export function isElement(it: ElementItem): it is Element {
  return "text" in it && "n" in it;
}
