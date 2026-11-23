# Cali Corral — Product & Design Spec

Nov 11, 2026 · @Glen

## Overview

Cali Corral (working name) is a free, open-source, offline-capable web app (PWA) that lets California criminal attorneys pick CALCRIM instructions, answer prompts for each blank and conditional, and export a finished, court-ready set of proposed instructions. It is a drafting tool for lawyers, not a replacement for their judgment. It is designed desktop-first (laptop and desktop browsers), with responsive layouts that still work on smaller screens.

**Problem.** Official CALCRIM instructions are templates full of brackets, alternatives, blanks and prose notes like "give element 7 when…". Turning them into clean text for a specific case is slow, manual and error-prone. Paid tools exist (LexisNexis's HotDocs-based automated CALCRIM, Westlaw Form Builder), but there is no free or open-source option.

**Target users**

- Criminal defense attorneys, especially solo, small-firm and court-appointed counsel without Lexis/Westlaw drafting add-ons
- Public defenders and prosecutors who want a lightweight, local tool
- Secondary: clinics, law students, trial advocacy programs

**Goals**

1. Produce instruction text that matches the official CALCRIM wording exactly for every choice the user makes.
2. Enter case facts once (defendants, counts, names, pronouns) and reuse them across all instructions.
3. Export a set of proposed instructions in the format California Rules of Court rule 2.1055 requires.
4. Always show which CALCRIM release the text comes from, and warn when it is out of date.
5. Keep all case data on the user's machine.

**Non-goals**

- Deciding which instructions to give, or whether a sua sponte duty applies. The app surfaces Bench Notes; the lawyer decides.
- Using generative AI in the document-generation loop.
- Legal research, case-law monitoring, or advice to self-represented defendants.
- Any instruction set other than CALCRIM, permanently (no CACI or CALJIC; the official guide also says CALJIC and CALCRIM should never be used together).
- Being, or claiming to be, an official Judicial Council product.
- Moving definitions that repeat across instructions into one shared section. Each instruction keeps its own definitions as printed (decided with the reviewing attorney, 2026-11-22).

## Background: how CALCRIM is written

CALCRIM uses a small, fairly consistent set of markup conventions, explained in the official "Guide for Using CALCRIM." The app's template format has to represent every one of them.

| Markup | Example | Meaning | App treatment |
| --- | --- | --- | --- |
| Square brackets | `[and unlawfully]` | Optional text, used depending on the case | Optional node tied to a yes/no question |
| Parentheses with slashes | `(his/her)`, `(firefighter/peace officer)` | Pick exactly one alternative | Choice node; pronouns come from the person record |
| Angle-bracket blanks | `<insert officer's name, excluding title>` | Fill in case-specific text | Field, ideally linked to case data (a person, count, agency) |
| Italic angle-bracket notes | `<Give element 4 when instructing on felony battery against a peace officer.>` | Instruction to the judge or drafter, never read to the jury | Question shown with the note text and related Bench Notes |
| Labeled alternatives | `<Alternative 2A - specified person performing duties>` | Pick one whole version of an element | Choice node with labeled branches |
| Choice-dependent punctuation | `(;/.)`, `[AND]` | Punctuation and "AND" depend on which elements are kept | Computed automatically by an element-list node |
| Blank count references | `[in Count ______]` | Which count the instruction covers | Linked to the case's count list |
| Cross-references | `give … Instruction 2670` | Another instruction may be required | Suggestion to add the related instruction |

Each instruction also has a title (not part of the instruction itself, and removable before it goes to the jury), a revision history line (for example "New January 2006; Revised … February 2025"), and Bench Notes. The Bench Notes cover Instructional Duty (including sua sponte duties), Authority, Related Issues, Commentary and lesser included offenses.

The instructions are drafted for one defendant. The official guide says the user must modify them for multiple defendants, or for multiple counts with different facts.

## Features

The core workflow runs in five steps, with no setup step up front. The sections below describe each area of the app; items marked *(later)* come after the first release.

1. Pick instructions
2. Answer the prompts for each instruction (case facts are asked for only when a blank needs them)
3. Preview the rendered text
4. Edit where needed
5. Export the proposed instruction set (the caption is asked for here)

### 1. Case setup

- **No setup step up front.** The user picks instructions first; the app asks for a case fact only when a selected instruction actually needs it.
- **Asked the first time a blank needs it, then reused:** defendant name and pronouns (many instructions say only "the defendant," so the name is often never needed), count numbers and charges, and people named in instructions (officers, victims, witnesses) with title, agency and pronouns, or "John/Jane Doe."
- Each fact is entered once and offered wherever another blank needs it; for example, `<insert officer's name>` becomes a dropdown of officers already entered.
- **Asked only at export:** the caption (court, case number, parties) and the proposing party, which rule 2.1055 requires on the cover page. Not asked for jury copies or plain text.
- A side panel lists the case facts entered so far, editable at any time; changes flow into every instruction that uses them.
- Save, reopen and duplicate case files.

### 2. Instruction picker

- Browse by CALCRIM series (100 Pretrial through 3500 Concluding) or search by number, title or Penal Code section.
- Each instruction shows its encoding status (reviewed, machine-checked, flagged, superseded) and its source release.
- Shows the Bench Notes' Instructional Duty text when picking, so sua sponte and "give on request" instructions are easy to spot. Informational only; the app never claims the list is complete.
- Suggests related instructions named in the text or Bench Notes (for example, 2652 suggests 2670 when lawful performance is at issue). The user accepts or dismisses each one.
- **Lesser included offenses (always asked).** Whether to instruct on a lesser included offense is the parties' and the court's choice. Sometimes the prosecution instructs on them and sometimes it doesn't, and a lesser offense can be separately charged or only alleged as included. So whenever the user adds an instruction for a charged offense, the app asks which lesser included offenses to instruct on, if any. The prompt shows:
  - the instruction's own LESSER INCLUDED OFFENSES Bench Notes, verbatim (including "not a lesser included offense" notes)
  - maintainer-reviewed links from each listed offense to the CALCRIM instruction that covers it, as one-click suggestions (860 lists "Assault With a Deadly Weapon. Pen. Code, § 245", which links to 875)
  - a search for any other instruction, because the Bench Notes lists are not exhaustive and many entries have no reviewed link

  The prompt is never skipped because no list or link exists. It always offers "None" and "Add another". It also suggests the matching verdict-form instruction (3517, 3518 or 3519), depending on whether the lesser and greater offenses are separately charged. The app never decides that a lesser offense must be given.
- **Definitions in other instructions.** Some instructions use a term that only another instruction defines. 2110 (Driving Under the Influence) uses "driving" and "driver", which only 2241 defines, and its Bench Notes say "On request, give CALCRIM No. 2241." Fifteen instructions print "[The term *firearm* is defined in another instruction.]" When a selected instruction depends on another for a definition, the picker suggests that instruction and names the terms. If such a definition is kept in the set without the instruction that defines it, the app warns before export. It's a suggestion, not a requirement, because the definition is often only given on request. An added definition instruction appears once in the set, however many instructions reference it, in its numerical CALCRIM position, not next to the instruction that referenced it. If 111 and 222 both reference 555, the set is ordered 111, 222, 555 (attorney guidance, 2026-11-22).
- Instructions are ordered in numerical CALCRIM order by default (which follows CALCRIM's own trial order, 100 Pretrial through 3500 Concluding). This includes instructions added from suggestions. The user can still reorder by hand.
- *(later)* Saved starter sets (for example "standard pretrial and closing instructions").

### 3. Guided questionnaire

- One screen per instruction, with questions generated from its template: yes/no for optional text, pick-one for alternatives, text or case-data fields for blanks.
- Each conditional note is shown verbatim next to its question, plus a link to the relevant Bench Notes.
- Questions that depend on earlier answers appear and disappear as needed.
- Answers that apply across instructions (defendant, officer, count) carry over automatically, with an override per instruction.
- An instruction can't be marked complete while any question is unanswered.

### 4. Live preview

- Side-by-side view: the questionnaire on one side, rendered text on the other, updating as the user answers.
- Toggle to show the official template with the user's choices highlighted, so the lawyer can check every choice against the source.
- Element numbering, "AND" placement and end-of-element punctuation update automatically when optional elements are dropped.

### 5. Editing and special instructions

- The rendered text can be edited by hand. The app keeps a diff against the generated text and marks the instruction "modified."
- If an edit goes beyond the template's options, the app flags that the instruction may count as a special instruction under rule 2.1055 and prompts for supporting citations, which appear at the bottom of its page.
- Fully custom special instructions can be added, with required citations.

### 6. Export

- **Proposed set (.docx):** formatted per rule 2.1055: cover page with caption and proposing party; index listing approved instructions by number and special instructions numbered consecutively, with the checklist (given as proposed / given as modified / refused / withdrawn); each instruction starting on its own page with its number and title at the top; no blanks or unused brackets; formatted as a court paper under the trial court rules.
- **Jury copy:** the same text with numbers, titles and citations removed, since the format of the copy given to the jury is up to the court.
- **Plain text / clipboard** for pasting into other documents.
- Every export carries a footer naming the CALCRIM release the text comes from.

* **Re-import (later):** each .docx carries the case file inside it (instruction numbers, template versions, answers and case facts) in a hidden custom XML part, which Word generally keeps when the document is edited and saved. Opening the .docx in the app restores the full interface for editing. If someone hand-edited the document, the app shows which instructions no longer match and asks which version to keep. The data is embedded by default with no warning in the way, since the criminal attorney asked didn't care about hidden metadata. A low-key "export clean copy" option covers anyone who does.

### 7. Freshness and updates

- On launch (and at least weekly if left open), check a published manifest for a newer instruction data release.
- Per-instruction status: if the official text (its normalized-text hash) changed in a release newer than the app's encoding, the instruction is flagged and export is blocked until the user explicitly overrides.
- Schedule-based warning that works offline: Judicial Council releases come at February and October meetings, so if the data predates the most recent expected release by more than 30 days, the app warns even without a network.
- When a case file is reopened after a data update, the app shows which of its instructions changed and the before/after text.
- Revoked or renumbered instructions are flagged in saved cases.

* **Always-visible freshness status:** a quiet status line in the app frame shows the corpus release and the last successful check, for example "October 2026 release · checked today" or "checked 4 days ago (offline)." It is part of the layout, never a popup or dismissable banner, and changes emphasis only when a warning applies.

### 8. Privacy

- Local-first: no account, no telemetry, no case data on any server. Case data lives only in the user's browser and in files they save. Network requests only fetch app and corpus updates and, when the user chooses, send a flag or proposed fix (template data and a note only).
- Case files are saved and opened as real files (optionally passphrase-encrypted). Browser storage is a working copy, not the record (see Web delivery below).
- Supports "John/Jane Doe" naming for protected witnesses and victims.

### 9. Flagging and fixing

- **Flag an instruction** from the questionnaire or preview: pick what's wrong (wording, missing option, wrong condition, other) and add a note. It goes through the in-app relay; no account needed. The app warns users not to include case details.
- **Fix it locally right away:** edit the instruction's template in a guided editor (at first, edit the rendered text). The fix applies only on this device, and the instruction shows as "locally modified."
- **Propose the fix:** one click sends the template change upstream. Only template data and the note are sent, never rendered text containing case names.
- **Track my reports:** the app keeps report numbers locally and shows their status (open, fixed, declined) from the published flag list.
- **Flag banners:** instructions with open flags show a banner with the report summaries, so everyone sees known problems within minutes.
- **Pending community fixes:** when a proposed fix has passed automated checks but isn't approved yet, users can apply it locally. It is clearly labeled as unreviewed.
- **Upstream changes:** when a shared template changes, users with a local override can keep theirs, switch to the new version, or compare the two.
- **Review level shown:** every instruction shows whether it is machine-checked or human-reviewed.

## Gotchas and safeguards

The biggest risk is a template that renders text that looks right but is wrong. Most safeguards below exist to stop that, or to make sure the lawyer sees it.

| # | Gotcha | Why it matters | Safeguard |
| --- | --- | --- | --- |
| 1 | Silent template errors | A dropped bracket or mis-wired condition produces plausible but wrong text; instructional error is a classic ground for appeal | Round-trip and property tests on every template; maintainer approval for changes; review level shown; highlighted template view in the app |
| 2 | PDF extraction artifacts | Extracted text already shows glitches like "offıcer" (broken "fi" ligature), hyphenation and page-break debris. Two worse problems were found in Phase 0. Both official PDFs carry **invisible duplicate text layers** (an OCR layer in the edition; a tagged-text layer in the supplement that doubles every character). And **blanks are drawn lines, not characters**, so naive extraction silently loses every fill-in blank | Invisible text (PDF render mode 3) dropped at the parser level; blanks recovered from drawn baseline rules; normalization pass, dictionary and character checks; title reconciliation against the tables of contents; round-trip test against the canonical source text |
| 3 | Prose conditions need legal judgment | Notes like "give element 7 when instructing on self-defense" can't be decided by software | Every condition becomes a question for the user, shown with its note and Bench Notes; never inferred |
| 4 | Choice-dependent punctuation | `(;/.)` and `[AND]` change with which elements are kept | Element-list node computes numbering, separators and "AND" |
| 5 | Nested brackets and parentheses | Options inside options in one sentence | Template format is a tree; schema allows nesting |
| 6 | Single-defendant drafting | Multi-defendant and multi-count cases need rewritten text (plurals, verb agreement, per-defendant elements) | Single defendant in v1; multi-count next; multi-defendant later, with templates annotated for agreement |
| 7 | Cross-instruction dependencies | Some instructions require others (lawful performance, lesser included offenses) | Encoded "related instruction" links shown as suggestions, including reviewed lesser-included and definition links; the lesser-included prompt always appears, even without links |
| 8 | Per-instruction revisions, revocations, renumbering | Releases revise some instructions, not all; numbers are sometimes reused or reserved | Each template records its source revision; manifest tracks status per instruction |
| 9 | **Case law ahead of CALCRIM** | An appellate decision can make an instruction wrong before the committee revises it | Persistent disclaimer; app never claims legal currency, only fidelity to a named release |
| 10 | Edits create special instructions | Substantially modified approved instructions need citations under rule 2.1055 | Diff tracking, "modified" flag, citation prompt |
| 11 | Court paper formatting | Proposed instructions must follow the trial court rules for papers (pleading-style layout) | Tested .docx template; sample outputs reviewed by practicing attorneys |
| 12 | Confidential names | Some victims and witnesses must be identified as John/Jane Doe | Doe naming in the person model; local-only storage; nothing sent to AI |
| 13 | Pronouns | CALCRIM offers his/her; the guide says the court may use they/them and should respect personal pronouns | Pronouns come from the person record and include they/them. Verb agreement requires per-template annotations (see Template format: Pronouns and agreement) |
| 14 | Title vs. instruction | Titles are not part of the instruction and may be removed before the jury hears them | Separate title field; jury-copy export drops titles |
| 15 | Review backlog | Two volumes of instructions; each needs careful human review | Ship every instruction machine-checked and labeled that way; human review starts with the most-used ones; flags steer what gets reviewed next |
| 16 | Liability | Lawyers rely on the output | Open-source "as is" license plus clear in-app disclaimers; get a quick legal review before release |

### Required disclaimers

Shown on first launch (user must acknowledge), on the About screen, and in short form in every export footer:

- **Not official.** This tool is not affiliated with or endorsed by the Judicial Council of California. The official instructions are published on courts.ca.gov.
- **Verify the text.** Compare generated instructions against the official CALCRIM text before filing or reading them to a jury.
- **Case law can get ahead of CALCRIM.** A court decision or new statute may make a current CALCRIM instruction incorrect before the Judicial Council revises it. This tool reflects the official text only, as of the release named below.
- **No legal advice.** The tool does not decide which instructions to give, whether a sua sponte duty applies, or how to modify an instruction. That is the attorney's and the court's responsibility.
- **Data as of:** "Instruction text from CALCRIM \[release name\], encoded \[date\]."

## High-level design

The system has four parts: an open **instruction corpus** in a GitHub repo (the source of truth), **maintainer tooling** built on GitHub Actions and pull requests, a small submission relay that turns in-app flags and fixes into GitHub issues and pull requests, and an **offline-capable web app** that renders everything locally. Lawyers never see GitHub. AI is used only in maintainer tooling, and nothing it produces reaches users without passing automated checks.

&#91;embedded content: architecture · GitHub, static host, lawyer's browser\]

AI drafts and user fixes both arrive as pull requests and must pass checks and a maintainer's merge; each merge, and each new flag, redeploys the static host within minutes. The browser renders everything locally with the same engine that passed the round-trip test, and only template data and notes ever travel back through the relay.

### Components

| Component | Runs where | Responsibility |
| --- | --- | --- |
| Corpus repo | GitHub (public) | Source of truth: templates, source PDF hashes, history. Issues hold flags; pull requests hold proposed changes |
| Source watcher | Owner's server, daily cron (a CLI command) | Detects new or changed CALCRIM PDFs on courts.ca.gov by hash; opens an update task |
| Extractor and AI drafter | Owner's server (a CLI command; polls GitHub for encoding requests) | Splits PDFs into per-instruction text, normalizes it, and proposes templates as pull requests |
| Validator | GitHub Actions, on every pull request (calls the same CLI) | Schema checks, round-trip test, property tests; posts a rendered preview |
| Review | GitHub pull request review (maintainers only) | Approve and merge; in-app review may replace this later |
| Build and deploy | GitHub Actions, on merge and on issue/PR events | Compiles, signs and deploys the corpus, manifest, open flags and pending fixes |
| Submission relay | Serverless function on the app's origin | Turns in-app flags, fixes and encoding requests into issues and pull requests |
| Rendering engine | Shared library (app and CI) | Turns template + answers into text, in jury, annotated and source modes |
| Web app (PWA) | User's browser (static site, works offline) | Case model, picker, questionnaire, preview, local overrides, flagging, export, freshness check |

Sharing one rendering library between the app and the tooling means the code that passes the round-trip test is exactly the code lawyers run.

### Template format

Each instruction is one file: metadata, people roles, questions, and a body tree. **The normative definition is the JSON Schema at `packages/engine/schema/template.schema.json`**, plus the semantic rules enforced by the validator. Full details are in `docs/design/technical-design.md` §4. This section summarizes format v1 and the extensions adopted after Phase 0.

**Top level:** `id`, `title`, `source` (source file, release, revision line, and `body_sha256`, the hash of the normalized official text), `review` level, `people` (roles besides the always-present defendant, each with the fields it uses: name, title, agency), `related` instructions, `questions`, `body`.

**Links to other instructions.** Each `related` entry has a kind and a reason, and every link is reviewed by a maintainer:
- **reference**: the text or Bench Notes point to another instruction (2652 → 2670).
- **definition**: the instruction relies on another for the definition of named terms (2110 → 2241 for *driver* and *driving*).
- **lesser included**: links a Bench Notes lesser-included entry to the instruction that covers that offense (860 → 875 for § 245). The entry's verbatim Bench Notes text is kept with the link.

The extractor proposes these links. It parses each LESSER INCLUDED OFFENSES section into entries (offense name, code citations, case citations, and whether the note says the offense is *not* lesser included), and it finds "give CALCRIM No. ____" references. **The links can't be detected confidently by machine.** On the 2026-10 corpus, 224 instructions have a LESSER INCLUDED OFFENSES section, with 344 listed offenses and 110 prose notes. Matching a listed offense to instructions by its code section gives one candidate for only 73 of them; 206 match several (Pen. Code § 240 matches more than a dozen assault instructions) and 65 match none. So proposals are reviewed by a maintainer, and the app's lesser-included prompt never depends on them (Features §2).

**Questions.** Questions are `boolean` (yes/no), `choice` (exactly one) or `multi` (one or more). A choice question can carry `articleFor` to suggest "a" or "an" from a field's value. A question is shown only when rendering actually consults it under the current answers, so dependent questions appear and disappear automatically. Every question must be used, and question ids are the stable contract with saved case files.

**Conditions.** A small expression language used wherever content depends on answers:

| Form | True when |
| --- | --- |
| `q` | boolean question `q` is answered yes |
| `q=opt` | choice question `q` is answered `opt` |
| `q~opt` | multi question `q` includes `opt` |
| `q>n` | multi question `q` has more than `n` options selected |
| `!a`, `a & b`, `a \| b`, `( )` | negation, conjunction, disjunction, grouping |
| `@multiple_defendants` | built-in flag; always false in v1 |

**Inline nodes:**

| Node | Official markup | Jury text |
| --- | --- | --- |
| text | literal | literal |
| emphasis | italic term | emphasized run |
| field | `______ <insert …>` | the bound value: `count`, free text, or a person role's name, title or agency |
| optional (`opt` + `if`) | `[…]` | content when the condition holds |
| choice | `(a/b/c)`, or bare `a/b` inside brackets (`[grand/petty]`) | the option the user picked |
| computed choice (`when`) | `(;/.)`-style or `(Y/y)`-style alternatives decided by other answers | the first option whose condition holds; none → nothing |
| pick one or more (`any`) with series connectors (`sep`) | `(a[,]/[or] b/[or] c)` | the selected options, joined by the series rule (Rendering rules, item 1) |
| pronoun | `(he/she)`, `(his/her)`, `(he/she/they)` | the bound person's pronoun |
| agreement (`agree`) | `was`, or `(is/are)` | plural form when the bound person uses they/them; `onlyIf` keeps it singular when another subject is selected ("(he/she/[or] someone else) was") |
| note | `<Give element 4 when …>` | nothing; shown beside the questions it governs |

**Blocks:** paragraphs; bullets (dropped in jury mode when empty); standalone notes; optional blocks whose brackets span several paragraphs; and element lists.

**Element lists.** Elements carry their printed label (`1`, `1A`, `(4/5)`, `a`), printed end punctuation (`;`, `.`, `(;/.)`, `:` or none) and printed conjunction (`AND`, `[AND]`, `OR`, `[OR]`, including `[AND` printed inside an optional element's own brackets). The engine computes jury numbering, end punctuation and conjunction placement. Lists can also be:

- **alternative element groups** (labeled alternatives such as 1A / [OR] / 1Bi–1Bii), one or more of which is selected
- **lettered sub-lists** (`style: alpha`)
- **plain numbered lists** of complete sentences (`plain: true`, e.g. verdict-form directions), whose printed punctuation is kept and which get no conjunction

**Pronouns and agreement.** Pronoun forms come from the person record: he, she or they. A printed they-form is used when CALCRIM has one; otherwise it is derived (he/she → they, him/her → them, his/her → their, his/hers → theirs, himself/herself → themselves). **In v1, they/them support covers a single person and depends on per-template agreement annotations.** Every verb that must change for they/them needs an `agree` node: the 84 instructions that print `(is/are)`-style alternatives, and many more with unmarked verbs ("(he/she) was"). Machine checks flag unannotated "they is/was/has/does" but can't find every case. The semantic pass must add these annotations before an instruction is machine-checked. Phase 3 then covers only agreement across multiple defendants.

**Extensions adopted after Phase 0** (to be added to schema v1 before the drafting brief needs them):

- **Errata.** **Rendered text stays as close as possible to what the CALCRIM PDFs print, even where it looks like a typo or misprint** (legal review, 2026-11-22). For example, 2670's "<insert name of felony>created" keeps its missing space in jury text: "…the crime of robberycreated a risk…". An erratum is how the project *records* a suspected flaw without correcting it. It never changes the jury text and never changes wording, spacing or punctuation.

  An erratum is a template attribute recording the exact location, the kind of suspected flaw, what CALCRIM prints, what it probably meant, and the evidence (the PDF page, confirmed visually). Kinds include spacing (missing or extra space), punctuation (e.g. 3517's period inside an optional bracket), wording (e.g. 200's repeated "or"), structure (unbalanced brackets or parentheses) and title (the table of contents disagrees with the instruction's heading).

  - **Use errata heavily.** Record one whenever the tooling or a reviewer suspects a typo or misprint. The bar is suspicion, not proof, and it's better to flag too much than too little. The extractor and drafter should detect likely misprints automatically and propose errata. Candidates include words joined with no space (especially after a `>` or a blank), unbalanced markup, doubled words, a paragraph that can end without closing punctuation, a period inside optional brackets, and title mismatches. A maintainer confirms each proposed erratum against the PDF and keeps it, or rejects it with a reason.
  - **Unbalanced markup.** The template keeps a well-formed tree, and source mode omits the closer the official text lacks, so the round trip still matches character for character. Where the closer goes is an interpretation, so the erratum states it and the app shows it.
  - **Visible to users.** Every erratum shows in the app's highlighted-template view, and in the preview beside the affected text ("CALCRIM prints this as shown; possible misprint: …"). The attorney decides whether to change it. A hand edit marks the instruction "modified", as with any other edit.

  Errata are reviewed like template changes and listed in the template's review notes.
- **Repeatable blocks.** A few instructions print identical copies of a paragraph to mean "repeat as needed". A closer look during drafting found 4 (3517, 3518, 3519 and 540B), not the 50 first counted; most of those were repeated `[AND]`/`[OR]` lines. Until this is built, these are encoded as their printed copies (as 3517 is). A repeatable block holds one copy of the content, the number of copies CALCRIM prints (so source mode still round-trips), and a prompt for how many the user needs. In jury mode each copy gets its own answers and fields.
- **Linked questions.** A choice node can map its options onto a subset of another question's options instead of declaring its own question. For example, 860's element 1A lists six weapons and its introduction lists seven. When the linked answer falls within the mapped subset, the choice is answered automatically and not asked again. Otherwise it is asked, with only the mapped options. The same thing is never asked twice.

**Not in v1: counts and plurals.** 290 instructions use `[s]` plural markers (`defendant[s]`, `count[s]`, `crime[s]`), often tied to the number of counts or crimes charged. In v1 each marker is a yes/no question. The multi-count phase should instead model plurality from the case data (counts, crimes, defendants) and derive the markers from it, rather than asking one question per marker.

Abridged example (945):

```yaml
schema: 1
id: "945"
title: "Battery Against Peace Officer (Pen. Code, §§ 242, 243(b), (c)(2))"
source: { file: calcrim-2026, release: "2026-10", revision_line: "New January 2006; Revised …", body_sha256: "…" }
review: machine-checked
people:
  officer: { label: "Peace officer", uses: [name, title] }
questions:
  - { id: unlawfully, type: boolean, prompt: "Include “and unlawfully”?" }
  - { id: felony, type: boolean, prompt: "Are you instructing on felony battery against a peace officer?" }
body:
  - elements:
      - n: "2"
        end: "(;/.)"
        text: ["The defendant willfully ", { opt: "and unlawfully", if: unlawfully },
               " touched ", { field: officer.name, hint: "insert officer's name, excluding title" },
               " in a harmful or offensive manner"]
      - { note: "Give element 4 when instructing on felony battery against a peace officer.", governs: [felony] }
      - n: "4"
        if: felony
        and: "AND"            # printed "[AND" inside the element's brackets
        end: "(;/.)"
        text: [{ field: officer.name }, " suffered injury as a result of the touching"]
```

### Rendering modes

- **Jury mode:** final text, no markup. Used for exports.
- **Annotated mode:** final text with each user choice highlighted and linked to its question. Used in preview.
- **Source mode:** re-emits the official markup (`[ ]`, `( / )`, `< >`) with no choices applied. Used only for the round-trip test.

### Rendering rules

Some official markup doesn't fully determine the jury text. The engine resolves these cases with fixed, documented rules (ADR 0005; technical design §5.4–5.5 and §12). The rules change only letter case, punctuation and where printed connectors go. They never change wording, and they always produce text the printed markup allows:

1. **Series connectors.** `[,]`, `[or]` and `[and]` are punctuation for whichever items are kept, not tied to the item they are printed beside (`[and]` is often printed only before the last item). With comma connectors, the conjunction goes before the last selected item, with commas after each non-last item when three or more are selected. Without them, the conjunction repeats ("A or B or C").
2. **Capitalization.** The first letter of every paragraph and element is capitalized, so a lowercase alternative chosen first reads correctly.
3. **Element lists.** Kept elements are numbered 1…n. Printed `;`, `.` and `(;/.)` ends become `;` on every element but the last and `.` on the last. The list's conjunction (AND, OR) goes before the last element when there are at least two.
4. **AND inside an optional element** (`[AND` … `4. …]`) is used only when that element is last, like `[AND]`.
5. **Alternative element groups.** With one alternative selected, its elements are numbered as ordinary consecutive elements (with only 1B chosen, 1Bi and 1Bii become elements 1 and 2). With several selected, each keeps its printed label re-based on the group's number (1A, 1Bi), and the alternatives are joined by the group's conjunction.
6. **Computed punctuation with nothing selected.** `[or socioeconomic status] (./,)` renders no punctuation when its item is omitted.
7. **Pronoun they-forms.** Derived as in Template format: Pronouns and agreement, with "themselves" for one person (owner decision).
8. **Jury text cleanup.** Spaces left by omitted content collapse. No space is left before closing punctuation (except a period starting a number, ".50 BMG") or after an opening bracket or quote. Paragraphs left with no letters or digits are dropped.
9. **Faithfulness to official flaws.** Where the official text appears to have a typo or misprint (2670's missing space in "…felony>created", 3517's period inside an optional bracket, 200's repeated "or"), jury text reproduces it exactly as printed, with no exceptions. The suspected flaw is recorded as an erratum, which the app shows to the user (Template format: Errata).

**A practicing attorney reviewed and approved these rules on 2026-11-22** (technical design §12). This is the rendering-rules part of Gate 0. Any change to a rule needs the same sign-off again, and every affected render is regenerated.

### Verification

- **Normalized official text** is the *canonical source text* produced by the extractor (ADR 0004; technical design §3). It has one string per paragraph, with `______` for each drawn blank, `<…>` for notes and insert hints, and `*…*` for emphasis outside notes. Canonical spacing rules remove layout accidents (glyph gaps after brackets, spaces after slashes, gaps between a blank and the following punctuation). Ligatures are expanded and the edition's broken "fi" is repaired. Curly quotes, dashes and § are kept exactly as published.
- **Round-trip test:** for every template, source-mode output must equal the normalized official text of that instruction, character for character. The title, revision line and `body_sha256` must also match. Any difference fails CI.
- **Bench Notes** are extracted and displayed, but not round-tripped. They are never rendered into instruction text. Their headings come from a heuristic and get spot checks only.
- **Property tests:** render many random answer combinations per template (500 per run, fictional data, random he/she/they). They fail on:
  - leftover markup characters, unfilled fields or unanswered questions
  - doubled spaces or punctuation, or a space before punctuation
  - a block not starting with a capital letter
  - element lists ending without a period
  - they/them agreement errors ("they was")
  - nondeterminism
- **Markup consistency (property):** every computed `;` or `.` and every AND placement must be one the printed markup allows. `;` is never last and `.` is always last. An unbracketed AND on a required element appears only when that element is last. Every last element has a printed conjunction before it.
- **Golden files:** a few hand-checked renders per instruction (reviewed by an attorney) are kept as regression tests. Candidates are generated for review and are never promoted automatically.
- **Errata** are checked like everything else. Source mode must still round-trip, jury text must be unchanged by an erratum, and every erratum must name its evidence and the maintainer who confirmed it.
- **Review tiers.** There are three levels:
  - **Skeleton:** a template drafted mechanically from the official markup. It passes the schema, round-trip and render checks, but its questions, people roles, pronoun targets, agreement annotations, prompts and computed punctuation haven't been worked out. **Skeletons never ship to users.** In the manifest they count as `not_encoded`.
  - **Machine-checked:** the semantic pass is done and the template passes every automated check: schema and semantic validation, round trip, property tests including markup consistency and agreement, and goldens where they exist. The semantic pass merges repeated alternatives into shared questions, binds fields to people roles and case data, picks the target person of every pronoun, adds agreement annotations, writes prompts and encodes computed punctuation. It may be AI-assisted in maintainer tooling and is reviewed by a maintainer on the pull request. At launch every instruction ships at least machine-checked and is labeled that way in the app.
  - **Human-reviewed:** a vetted reviewer has approved the template and its renders. This status is earned over time, starting with the most-used instructions.

  Changes after launch, including flag-driven fixes, need maintainer approval on the pull request (enforced by branch protection).

### Ingestion pipeline

1. Watcher checks the CALCRIM download page once a day with conditional requests (only a tiny header exchange when nothing changed), identifies itself with a User-Agent that includes contact info, and downloads a PDF only when it changes, about twice a year. It records the URL, hash and release name.
2. Extractor splits it into instructions and normalizes text (ligatures, hyphenation, headers and footers).
3. For instructions whose text changed, a diff against the previous release is generated.
4. The manifest is updated immediately to mark changed instructions **superseded**, and a quick data release goes out. Users are warned before re-encoding is done.
5. The drafter proposes new or updated templates: a mechanical skeleton from the official markup, then a semantic pass (which may be AI-assisted) that makes it machine-checked. The validator runs.
6. A pull request is opened. CI posts the rendered template, the source text and the diff as a comment, and maintainers review on GitHub (in-app review may come later).
7. Merging triggers a build that compiles, signs and deploys the corpus alongside the app, usually within minutes.

### Community fixes and publishing

Users flag and fix instructions inside the app; GitHub stays behind the scenes as the store, review queue and build system.

**From the app to GitHub: the submission relay**

- A serverless function on the app's own origin (so the strict CSP still holds) accepts three calls: submit a flag, submit a proposed fix, and request encoding of an instruction.
- It creates GitHub issues and pull requests through a GitHub App the project owns. Users need no account; the app can optionally collect an email for follow-up.
- Abuse controls: per-IP rate limits, a proof-of-work CAPTCHA, size limits, and a schema check on proposals. Spam costs triage time but can't publish anything.
- Its API is defined independently of GitHub, so a later version can add in-app review, or replace GitHub with a database, without changing the app.

**From GitHub to the app: publishing**

This is a standard static-site deploy.

1. On every merge, a GitHub Actions job validates all templates, compiles them into one JSON file per instruction (content-hashed file names), builds and signs the manifest, and deploys everything to the static host with the app.
2. On issue and pull request events, a lighter job regenerates two small files: open flags per instruction, and pending fixes that passed checks.
3. The app fetches the manifest when online (short cache lifetime, so online users see updates within minutes), downloads only instruction files that changed, and the service worker keeps the last good copy, so the app keeps working offline for days or weeks while the freshness status line shows how long it has been.

From a merge or a new flag to users' screens takes a few minutes, mostly build time. About 800 small template files make a tiny build.

### Freshness manifest

A small signed JSON file at a stable URL (served from the app's own origin):

- `corpus_version`, `published_at`, `signature`
- `source_release`: name and date of the CALCRIM edition or supplement the corpus reflects
- `expected_next_release`: the next February or October Judicial Council meeting, plus a 30-day grace period
- Per instruction: `number`, `title`, `status` (current / superseded / revoked / not\_encoded / reserved), review level (machine-checked / reviewed), open flag count, `source_revision`, `body_sha256`, `template_hash`

`body_sha256` is the SHA-256 of the instruction's normalized official text, the same hash each template records in its `source`. An instruction becomes **superseded** only when a newer release changes this hash. The revision line alone can't decide it: a supplement revision that touches only the Bench Notes (marked with `*` in the supplement) leaves the instruction text and its hash unchanged, so the template stays current. Supplements contain only revised and new instructions, so the corpus for a release is the edition merged with its supplement instruction by instruction.

The app verifies the signature, compares against its installed corpus, and applies the status rules in Features §7. Offline, it falls back to the schedule check using `expected_next_release`.

### Web delivery (PWA)

The app ships as a static, offline-capable web app, because locked-down work laptops often block installing executables but allow websites. Storage size is not a problem; how long browser storage lasts, and whether users can trust the hosted code, are the real issues.

**Storage budget** (measured in Phase 0 on the 2026-10 corpus of 782 instructions)

| Data | Measured size | Where it lives |
| --- | --- | --- |
| App code (UI, engine, .docx library) | a few MB; the engine alone is 249 KB minified, 78 KB gzipped (including schema validation and YAML parsing, which the app doesn't need) | Service worker cache |
| Compiled templates | \~5.6 MB raw, \~1.8 MB gzipped (projected from the pilot: \~7.2 KB, \~2.3 KB gzipped each) | IndexedDB or Cache API |
| Bench Notes, all instructions | 2.5 MB raw, 1.0 MB gzipped | IndexedDB or Cache API |
| Full corpus (templates, Bench Notes, manifest) | \~8 MB raw, \~3 MB gzipped | IndexedDB or Cache API |
| One case file | tens of KB | IndexedDB, plus files the user saves |
| Exports | generated on demand | User's downloads |

This fits browser limits easily. Don't use `localStorage`, which is capped at 5 MiB per origin. IndexedDB and the Cache API get a share of the disk: up to 60% in Chrome, around 60% in Safari, and the smaller of 10% or 10 GiB in Firefox (best-effort mode) ([MDN](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

**Limitations and how the design handles them**

- **Eviction.** Best-effort storage can be wiped when the disk is nearly full, and Safari deletes script-created data for a site with no click or tap in seven days of browser use. Managed browsers or private windows may also clear data on exit. Mitigation: request persistent storage (`navigator.storage.persist()`), treat the corpus as a re-downloadable cache, and make saved files the record for case data. Show "unsaved changes" and the last-saved time.
- **Saving files.** Saving back to the same file (File System Access API) works only in Chromium browsers. Firefox and Safari get download and open-file instead.
- **Trust in hosted code.** A compromised host could serve code that sends case data elsewhere, a risk a signed desktop build doesn't have. Mitigation: a strict Content Security Policy that allows network requests only to the app's own origin; no third-party scripts or analytics; reproducible builds with published hashes.
- **Update drift.** The service worker keeps serving the old app until it updates. Mitigation: show app and corpus versions, and prompt to reload when a new version is ready. Corpus freshness rules are unchanged.
- **Same-origin corpus.** Host the corpus and manifest on the app's own origin (no CORS, one CSP). Keep manifest signatures so a tampered corpus file is detected.
- **No PDF export.** Out of scope for now: .docx is the only document export.
- **Blocked features.** Some managed browsers disable service workers or site storage. The app still works online in a tab, with no offline mode; current users are expected to have ordinary browser access, so no desktop build is planned.

### Suggested stack (all open source)

- **App shell:** a static progressive web app (service worker for offline use, IndexedDB for storage) with a TypeScript UI
- **Desktop build:** Tauri (small, cross-platform), considered and dropped; current users can reach a public web service
- **Rendering engine:** a TypeScript library with no UI dependencies, so it can also power a CLI and the review tool
- **.docx export:** the `docx` npm library (MIT), which runs in the browser; no PDF export (see Web delivery)
- **PDF extraction (maintainer tooling only):** pdfplumber / pdfminer.six (MIT); avoid AGPL libraries if the tooling might be reused under other licenses
- **Case-file encryption:** WebCrypto (AES-GCM with a passphrase-derived key)
- **Signing:** minisign or Sigstore for corpus releases, verified in the app
- **Hosting:** a hosting-agnostic setup of static files plus one small HTTP function (the relay), written against the standard Fetch API so it runs on Cloudflare Workers, Node or Deno. Reference deployment: Cloudflare (Pages for static files, a Worker for the relay); alternative: the owner's Linux VM. Ingestion jobs run on the owner's server; GitHub holds the corpus repo and CI. The project owner hosts the main build; no self-hosting for now
- **Relay anti-abuse:** rate limiting plus an open-source proof-of-work CAPTCHA such as ALTCHA

## Legal and licensing notes

A free tool for attorneys is on solid ground: the Judicial Council intends the instructions to be freely available for use and reproduction. These notes are research, not legal advice; get a short review from a California attorney before release.

- **Use of the text.** Rule 2.1050(c) says the Judicial Council intends the instructions to be freely available for use and reproduction by parties, attorneys and the public. After *Georgia v. Public.Resource.Org*, the Council amended the rule in 2023 and stopped registering copyright in CALCRIM.
- **Stay non-commercial.** The rule lets the Council require permission and fees from "commercial publishers" (entities that publish works for sale, for profit or not). Keep the app and corpus free. If anyone ever wants a paid edition, ask the Council for a license first.
- **Attribution, no copyright claim.** Credit the Judicial Council as the source in the app, the corpus and every export. Don't claim copyright in the instruction text.
- **Licensing split.** App code under a permissive license (MIT or Apache-2.0). In the corpus, mark instruction text as the Judicial Council's freely reproducible work, and license the project's own structure and annotations under CC0 or CC BY.
- **Use only the courts.ca.gov source.** Ingest from the PDFs on courts.ca.gov. Don't use LexisNexis's HotDocs templates, Westlaw content, or publisher-added material such as secondary-source references.
- **No implied endorsement.** Don't call the app "official" or "the CALCRIM app"; pick a name that doesn't suggest Judicial Council backing.
- **Audience.** Position it as a drafting tool for attorneys and courts. It doesn't recommend instructions, which keeps it clear of giving legal advice.
- **AI and courts.** Courts' generative-AI policies under Rule 10.430 bar entering confidential information into public AI systems. The app's core loop uses no AI and sends no case data anywhere, which avoids this for any court staff who use it.

## Roadmap and open questions

Ship a narrow, well-verified first release before widening coverage. Multiple defendants come last because they are the hardest to get right.

### Roadmap

Each phase ships only after its gate is met. Gates are criteria, not dates.

**Phase 0: Foundations**
- Template schema; rendering engine with jury, annotated and source modes
- PDF extractor and normalization; round-trip and property tests in CI
- CI previews on pull requests; draft and machine-check all ~800 instructions (skeleton plus semantic pass, as defined under Verification)
- Note: `docs/PHASE-0.md` covers only the first part of this phase (foundations plus a 12-instruction pilot) and ends at its own stop point. Drafting the remaining instructions is a separate brief that follows owner review.

> **Gate 0:** every template passes the round-trip test, and a practicing attorney approves sample output (the golden candidates) **and signs off on the rendering rules** (High-level design: Rendering rules; the rules were signed off 2026-11-22).

**Phase 1: First release (single defendant)**
- Instruction picker, questionnaire with on-demand case facts, live preview, edit tracking
- Lesser-included-offense prompt for charged offenses; definition and reference suggestions
- Rule 2.1055 .docx export; signed manifest and freshness checks
- In-app flags via the relay, local overrides, flag banners, review levels shown

> **Gate 1:** two attorneys use it in real trial prep, and the exports need no reformatting.

**Phase 2: Breadth**
- Template editor; proposed fixes become pull requests via the relay
- Pending community fixes users can apply locally; report status tracking
- Human review of the most-used instructions; multi-count cases, with plurality (`[s]` markers on counts and crimes) derived from the case data rather than asked marker by marker

> **Gate 2:** one full February or October CALCRIM release handled end to end.

**Phase 3: Multiple defendants**
- Agreement across multiple defendants (plurals, verbs, pronouns). Single-person they/them agreement is already annotated in v1
- Per-defendant elements and applicability
- Optional in-app review for maintainers (GitHub stays the store)

Gates are criteria, not dates; timing depends mostly on how many reviewers join.

### Open questions

1. **Desktop wrapper:** is a Tauri build worth maintaining for offices whose managed browsers block service workers or clear site data? Decided: no. Current users can reach a public web service.
2. **Hosting:** who hosts the main build, and should there be a one-step self-hosting kit for offices? Decided: Glen hosts the main build; no self-hosting for now.
3. **Reviewers:** who approves templates (volunteer attorneys, public defender offices, law school clinics), and what counts as an approval? Decided: a hand-picked group of users verifies templates. Verifiers review on GitHub for now; in-app review moves up only if that proves too hard for them.
4. **PDF export:** print stylesheet or a .docx-to-PDF path? Pleading-style line numbers are the hard part. Decided: no PDF export; .docx only.
5. **Name:** something that doesn't imply Judicial Council endorsement. Decided: Cali Corral (working name).
6. **Corpus governance:** who can merge templates, and how users report and triage text errors. Partly decided: users flag and propose in the app through the relay; maintainers merge on GitHub. Still open: who the maintainers are.
7. **Grace period:** how long after a February or October meeting before the app warns, given publication lag. Decided: 30 days.
8. **Court paper template:** confirm the .docx layout with practitioners in a few counties (rule 2.1055(e) bars local rules from requiring a different format).
9. **CACI later?** Civil instructions use the same conventions and rules, so the engine could extend to them. Decided: no; CALCRIM only, permanently.
10. **Relay moderation:** who triages incoming flags, and what rate limits and CAPTCHA settings are acceptable? Decided: Glen and a select group of vetted users triage; limits err on the permissive side.
11. **Submission privacy:** beyond warnings, should the relay screen notes for things that look like names or case numbers before filing them publicly? Decided: no; the in-app warning is enough.

## Sources

- [Cal. Rules of Court, rule 2.1050 (Judicial Council jury instructions)](https://courts.ca.gov/cms/rules/index/two/rule2_1050)
- [Cal. Rules of Court, rule 2.1055 (Proposed jury instructions)](https://courts.ca.gov/cms/rules/index/two/rule2_1055)
- [Rule amendments effective April 1, 2023 (rule 2.1050 text)](https://courts.ca.gov/system/files/2023-03-24-rules-effective-04-01-2023.pdf)
- [Invitation to Comment W23-11: Jury Instructions, Public Access and Publication](https://www4.courts.ca.gov/documents/w23-11.pdf)
- [Guide for Using CALCRIM (in CALCRIM-2025-02 invitation to comment)](https://courts.ca.gov/system/files/itc/calcrim-2025-02.pdf)
- [CALCRIM October 2026 supplement](https://courts.ca.gov/system/files/file/calcrim_2026_supplement.pdf)
- [Criminal Jury Instructions Advisory Committee (official downloads)](https://courts.ca.gov/advisory-body/criminal-jury-instructions-advisory-committee)
- [Cal. Rules of Court, rule 10.430 (Generative AI use policies)](https://courts.ca.gov/cms/rules/index/ten/rule10_430)
- [LexisNexis Automated Templates for California](https://law.lexisnexis.com/lexis-plus-premium-titles-california-newyork-florida)
- [Westlaw Form Builder: California resources](https://www.thomsonreuters.com/content/dam/helpandsupp/en-us/Topics/form-builder/files/resources-for-california.pdf)
- [Justia CALCRIM index](https://www.justia.com/criminal/docs/calcrim/)
- [Code for Baltimore jury instructions proof of concept](https://github.com/CodeForBaltimore/JuryInstructions)
