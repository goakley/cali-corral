# UI direction

> **Status: draft, needed for Phase 1 (not Phase 0).** Sections marked **TODO (Glen)** need the owner's input. Everything else reflects decisions already in `docs/SPEC.md`.

## Principles

- Desktop-first (laptop and desktop browsers). Layouts should stay usable on smaller screens, but don't design for phones first.
- Avoid excessive whitespace; take advantage of the desktop-first design to pack relevant information on the screen.
- No setup step up front. Users pick instructions first; case facts are asked for only when a blank needs them, then reused.
- Freshness status is always visible as a quiet status line in the app frame (for example "October 2026 release · checked 4 days ago (offline)"). Never a popup or dismissable banner.
- Instructions with open flags show the flag summaries in place, next to the instruction.
- Every instruction shows its review level (machine-checked or reviewed) and whether it's locally modified.
- Provide proper keyboard navigation support, particularly for tabbing around the inputs.
- Plain, calm, professional look. Use an open-source component library and its defaults; don't invent a visual style.
- Transitions should be snappy; animations should take an extremely short amount of time to avoid slowing down the user.
- Avoid modal dialog popups for routine actions.
- Keep iconography consistent across the whole app.
- Avoid excessive use of colour; colour should be used sparingly for important callouts.
- Take advantage of the screen width when it meets or exceeds 1280px by using side-by-side views for input and previews.

## Reference apps (optional)

**TODO (Glen):** apps whose layout or flow you'd like this to feel like, with one line on what to borrow from each. Example: "VS Code: resizable side panels."

## Screens

| Screen | Purpose | Status |
| --- | --- | --- |
| Main workspace | Instruction list, questionnaire and live preview together | Proposed wireframe below |
| Instruction picker | Browse by series, search by number, title or Penal Code section | TODO |
| Case facts panel | Review and edit facts entered so far | TODO |
| Export | Caption entry, export options (proposed set, jury copy, plain text, clean copy) | TODO |
| Flag / fix | Report a problem, edit a template locally, propose the fix | TODO |
| First launch | Required disclaimers (see SPEC, "Required disclaimers") | TODO |

### Main workspace (draft)

```
┌──────────────────────────────────────────────────────────────┐
│ Cali Corral   Case: People v. Doe ▾        Oct 2026 · today ✓│
├──────────────┬───────────────────────────┬───────────────────┤
│ INSTRUCTIONS │ QUESTIONS — 945            │ PREVIEW           │
│ ✓ 200        │ Felony battery? (•)Yes ( )No│ 1. Officer Smith  │
│ ● 945  ⚑     │ Officer: [Smith ▾]         │    was a peace... │
│ ○ 2670       │ ⓘ Bench note: give el. 4…  │ 2. The defendant  │
│ + Add        │                            │    willfully...   │
├──────────────┴───────────────────────────┴───────────────────┤
│ Case facts (3) ▸                           [Export .docx]    │
└──────────────────────────────────────────────────────────────┘
```

- ✓ complete, ● in progress, ○ not started; ⚑ has open flags.
- The top-right status line is the freshness indicator.
- When below 1280px wide, allow toggling between the preview and the questions.
- **TODO (Glen):** must-haves vs. nice-to-haves for this screen.

## Must vs. nice-to-have

**TODO (Glen):** list anything the agent may simplify or skip in Phase 1.
