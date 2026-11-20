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
- Reorder instructions; the default order follows CALCRIM's own trial order.
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
- Per-instruction status: if the official text was revised in a release newer than the app's encoding, the instruction is flagged and export is blocked until the user explicitly overrides.
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
| 2 | PDF extraction artifacts | Extracted text already shows glitches like "offıcer" (broken "fi" ligature), hyphenation and page-break debris | Normalization pass, dictionary and character checks, round-trip test against a clean source |
| 3 | Prose conditions need legal judgment | Notes like "give element 7 when instructing on self-defense" can't be decided by software | Every condition becomes a question for the user, shown with its note and Bench Notes; never inferred |
| 4 | Choice-dependent punctuation | `(;/.)` and `[AND]` change with which elements are kept | Element-list node computes numbering, separators and "AND" |
| 5 | Nested brackets and parentheses | Options inside options in one sentence | Template format is a tree; schema allows nesting |
| 6 | Single-defendant drafting | Multi-defendant and multi-count cases need rewritten text (plurals, verb agreement, per-defendant elements) | Single defendant in v1; multi-count next; multi-defendant later, with templates annotated for agreement |
| 7 | Cross-instruction dependencies | Some instructions require others (lawful performance, lesser included offenses) | Encoded "related instruction" links shown as suggestions |
| 8 | Per-instruction revisions, revocations, renumbering | Releases revise some instructions, not all; numbers are sometimes reused or reserved | Each template records its source revision; manifest tracks status per instruction |
| 9 | **Case law ahead of CALCRIM** | An appellate decision can make an instruction wrong before the committee revises it | Persistent disclaimer; app never claims legal currency, only fidelity to a named release |
| 10 | Edits create special instructions | Substantially modified approved instructions need citations under rule 2.1055 | Diff tracking, "modified" flag, citation prompt |
| 11 | Court paper formatting | Proposed instructions must follow the trial court rules for papers (pleading-style layout) | Tested .docx template; sample outputs reviewed by practicing attorneys |
| 12 | Confidential names | Some victims and witnesses must be identified as John/Jane Doe | Doe naming in the person model; local-only storage; nothing sent to AI |
| 13 | Pronouns | CALCRIM offers his/her; the guide says the court may use they/them and should respect personal pronouns | Pronouns come from the person record and include they/them, with verb agreement |
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

Each instruction is one file: metadata, questions, and a body tree. Node types:

- **text**: literal words
- **field**: a blank, bound to case data (`officer.name`, `count.number`) or free text
- **optional**: shown when a condition holds (bracketed text)
- **choice**: exactly one of several branches (parenthetical alternatives, labeled alternatives); pronoun choices bind to a person's pronouns
- **elementList / element**: numbered elements; the engine computes numbering, `;` vs `.`, and where "AND" goes
- **note**: drafter-facing text that is never rendered (angle-bracket notes), linked to the question it governs
- **related**: a pointer to another instruction, surfaced as a suggestion

Illustrative sketch (not final syntax, abridged):

```yaml
id: "945"
title: "Battery Against Peace Officer (Pen. Code, §§ 242, 243(b), (c)(2))"
source:
  release: "<CALCRIM release name>"
  revision_line: "<New …; Revised …>"
  pdf_sha256: "<hash of the official PDF>"
questions:
  - id: felony
    type: boolean
    prompt: "Are you instructing on felony battery against a peace officer?"
    note: "Give element 4 when instructing on felony battery against a peace officer."
body:
  - elementList:
      - element: [ {field: officer.name}, " was a peace officer performing the duties of ",
                   {choice: article}, " ", {field: officer.title} ]
      - element: [ "The defendant willfully ", {optional: "and unlawfully", if: unlawfully},
                   " touched ", {field: officer.name}, " in a harmful or offensive manner" ]
      - element: { if: felony, content: [ {field: officer.name}, " suffered injury as a result of the touching" ] }
```

### Rendering modes

- **Jury mode:** final text, no markup. Used for exports.
- **Annotated mode:** final text with each user choice highlighted and linked to its question. Used in preview.
- **Source mode:** re-emits the official markup (`[ ]`, `( / )`, `< >`) with no choices applied. Used only for the round-trip test.

### Verification

- **Round-trip test:** for every template, source-mode output must equal the normalized official text of that instruction, character for character. Any difference fails CI.
- **Property tests:** render many random answer combinations per template; fail on leftover markup characters, unfilled fields, doubled spaces or punctuation, or element lists ending without a period.
- **Golden files:** a few hand-checked renders per instruction (reviewed by an attorney) are kept as regression tests.
- **Review tiers:** at launch every instruction ships as machine-checked (an AI draft that passes the round-trip and property tests) and is labeled that way in the app. Human-reviewed status is earned over time, starting with the most-used instructions. Changes after launch, including flag-driven fixes, need maintainer approval on the pull request (enforced by branch protection).

### Ingestion pipeline

1. Watcher checks the CALCRIM download page once a day with conditional requests (only a tiny header exchange when nothing changed), identifies itself with a User-Agent that includes contact info, and downloads a PDF only when it changes, about twice a year. It records the URL, hash and release name.
2. Extractor splits it into instructions and normalizes text (ligatures, hyphenation, headers and footers).
3. For instructions whose text changed, a diff against the previous release is generated.
4. The manifest is updated immediately to mark changed instructions **superseded**, and a quick data release goes out. Users are warned before re-encoding is done.
5. AI drafter proposes new or updated templates; validator runs.
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
- Per instruction: `number`, `title`, `status` (current / superseded / revoked / not\_encoded), review level (machine-checked / reviewed), open flag count, `source_revision`, `template_hash`

The app verifies the signature, compares against its installed corpus, and applies the status rules in Features §7. Offline, it falls back to the schedule check using `expected_next_release`.

### Web delivery (PWA)

The app ships as a static, offline-capable web app, because locked-down work laptops often block installing executables but allow websites. Storage size is not a problem; how long browser storage lasts, and whether users can trust the hosted code, are the real issues.

**Storage budget** (sizes are estimates, to be measured in Phase 0)

| Data | Rough size | Where it lives |
| --- | --- | --- |
| App code (UI, engine, .docx library) | a few MB | Service worker cache |
| Full instruction corpus (templates, Bench Notes, manifest) | \~10–30 MB uncompressed, less compressed | IndexedDB or Cache API |
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

&#91;embedded content: roadmap · 4 phases, 3 gates\]

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
