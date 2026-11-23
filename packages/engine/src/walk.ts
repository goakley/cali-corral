import type { Element, ElementGroup, ElementItem, Inline, NoteBlock } from "./types.ts";

export function toInlines(xs: Inline[] | string): Inline[] {
  return typeof xs === "string" ? [xs] : xs;
}

export function isNoteItem(it: ElementItem): it is NoteBlock {
  return "note" in it && !("text" in it) && !("alt" in it);
}

export function isElement(it: ElementItem): it is Element {
  return "text" in it && "n" in it;
}

export function isGroup(it: ElementItem): it is ElementGroup {
  return "alt" in it;
}

/** All elements of a list, including those inside alternative groups. */
export function allElements(items: ElementItem[]): Element[] {
  return items.flatMap((it) =>
    isElement(it) ? [it] : isGroup(it) ? it.options.flatMap((o) => o.elements) : [],
  );
}
