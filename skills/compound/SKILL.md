---
name: compound
description: >-
  Use when the user wants to promote cross-project knowledge to the global
  Engineering/ folder, or says "promote knowledge", "compound notes",
  "knowledge synthesis", or "find repeated ideas across projects".
---

# Compound Knowledge Promotion

Identify knowledge that has crystallized across multiple projects and promote it to a global Engineering/ note.

## Upstream Pipeline Synergy
Works as the horizontal synthesis stage downstream of `/distill`:
1. `/distill` dehydrates raw daily logs and inbox items into structured project/mechanism notes.
2. `/compound` scans across multiple projects (`20-Projects/` or `working/`), detects recurring architectural patterns, and synthesizes global platform standards in `Engineering/` (or `30-Engineering/`).

## Workflow

1. **Scan project knowledge dirs** — Call `obsidian_list_notes` across project directories:
   Scan paths matching `20-Projects/**` or `working/*/knowledge/*.md`.

2. **Semantic clustering** — For each candidate note path, call `obsidian_rag_query`
   with the note filename (without extension) as query, `limit: 8`.
   Track which concepts/notes appear in results from 2+ different projects — these are candidates for global promotion.

3. **Read candidates** — Call `obsidian_read_note` on shortlisted files.
   Look for shared definitions, patterns, or insights worth generalizing.

4. **Draft global note** — Compose a new `Engineering/<ConceptName>.md` (or `30-Engineering/<Category>/<ConceptName>.md`) with:
   - Frontmatter: `type: concept`, `created: <today>`, `status: verified`
   - Synthesized body structured with the Four Pillars (Physical Context, Invariants, Mermaid dataflow, Preventative Safeguards)
   - `## Source Notes` section with `[[wikilinks]]` back to originating project notes

5. **Show draft to user** — Present the proposed note content and path before creating.
   Ask for confirmation.

6. **Create on approval** — Call `obsidian_create_note` with the approved content.

7. **Report cross-links** — List which project knowledge notes should now add `[[ConceptName]]`
   to avoid re-discovering this knowledge next time.

## Arguments

Optional topic hint: `/compound authentication patterns` or `/compound QML Loader`

## Tips

- If `obsidian_rag_query` returns no results, suggest running `/obsidian:index` first
- If no notes appear in 2+ projects, report that and suggest manual promotion
- Run `/distill` first if insights are still raw daily logs in `50-Journal/`
