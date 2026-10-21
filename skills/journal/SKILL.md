---
name: journal
description: >-
  Use when the user wants to work with their daily note — view today's entry,
  add a log, do a daily review, or capture quick thoughts. Covers all daily
  note workflows.
---

# Daily Journal

Work with today's daily note in the Obsidian vault.

## Default Action (no arguments)

1. Call `obsidian_get_daily_note` to retrieve today's note
2. Summarize key tasks, events, or entries
3. Ask if the user wants to add anything

## Quick Capture (with arguments)

If the user provides text after `/journal`, log it:

1. Call `obsidian_append_daily_log` with heading "Notes" and the user's text
2. Confirm what was logged

## Common Headings

When logging entries, use these standard headings:
- **Work Log** — tasks, progress, accomplishments
- **Notes** — general thoughts and observations
- **Ideas** — creative ideas and inspirations
- **Meetings** — meeting notes and action items

## Weekly Review

If the user asks for a "weekly review":
1. List recent daily notes via `obsidian_list_notes` (subfolder "Daily Notes")
2. Read each day's note
3. Summarize themes, accomplishments, and open items

## Multi-Session Daily Activity Recap (/recap)

Use this workflow when the user wants to summarize today's work across workspaces, consolidate daily activities, or runs `/recap` / `/obsidian:recap`:

1. **Harvest Sessions**:
   Call `obsidian_harvest_cli_sessions` with `date` (defaults to today) and optional `template_path`.

2. **Template-Driven Formatting**:
   - **When a custom template is provided (`templateContent`)**:
     Analyze the template structure and map the harvested activities into the corresponding sections/placeholders (e.g. accomplishments, engineering milestones, reflections, or next steps) while strictly preserving the user's template headings and formatting.
   - **When no template is provided (Default Universal Format)**:
     Synthesize a clean, structured project activity summary:
     - Group activities by project or repository name.
     - For each project, extract:
       - **Accomplishments**: Key problems solved, features implemented, or tasks completed (derived from user prompts and topic transitions).
       - **Engineering Milestones**: Meaningful operations such as Git commits, Pull Requests/reviews, issue keys, or automated tests run.
       - **Topics & Explorations**: Core technical topics, investigations, or architectural decisions discussed.

3. **Vault Ingestion**:
   Append the synthesized summary to today's daily note under the designated heading (defaults to `Work Log` or the heading specified by the user/template) via `obsidian_append_daily_log`.

4. **Response**:
   Present the plain-text summary to the user for immediate review.
