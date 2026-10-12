---
name: distill
description: >-
  Extracts high-signal engineering and mathematical knowledge from daily notes or draft files,
  performs semantic deduplication against existing vault notes, and subsumes findings into core
  mechanism notes (or crystallizes new Four Pillars notes) with non-destructive in-place backlinking.
  Triggers on "/distill", "distill note", "extract knowledge", "crystallize note", "脱水", "知识提炼",
  "提炼经验", or "升维总结".
  Do NOT trigger for: simple note searching (use search), daily log appending (use journal), or lint-only checks (use vault-lint).
---

# Knowledge Distillation Pipeline (知识脱水流水线)

Extract high-signal mechanism knowledge, implicit contracts, and preventative safeguards from raw daily notes or inbox drafts, and crystallize them into permanent Evergreen notes or subsume them as case studies.

## Core Mandates & Principles

1. **Subsumption over Fragmentation**: Never create orphan bug notes. If an existing mechanism note matches the concept (RAG similarity >= 0.82 or confirmed by user), append the finding as a `Case Study` under `## 典型故障案例与现场演绎` (or `## Case Studies`).
2. **Four Pillars Blueprint**: Every crystallized note must systematically structure:
   - **Physical Entry Points**: Source code path, line number, or symbol.
   - **Symptom vs. Ground Truth**: Surface error contrasted against root cause.
   - **Implicit Contracts & Topology**: Unwritten concurrency, lifecycle, or timing rules + Mermaid sequence diagram or LaTeX proofs.
   - **Preventative Safeguards**: Concrete defensive rules to avoid future regressions.
3. **Non-destructive In-place Provenance**: The source note retains original context. Mark the processed segment with:
   `<!-- distilled: [[target_note#case-anchor]] @ YYYY-MM-DD HH:mm -->`

---

## Workflow

### Step 1: Ingest Source & Parse Segments

1. **Resolve Target File**:
   - If user provided a file path (e.g., `/distill 10-Inbox/draft.md`): call `obsidian_read_note` on that path.
   - If user provided a topic keyword (e.g., `/distill ADAS掉帧`): call `obsidian_search_notes` or read recent daily notes to find matching sections.
   - If no argument: call `obsidian_get_daily_note` to retrieve today's daily note.
2. **Scan for Un-distilled Content**:
   - Parse sections (H2 `## ` or H3 `### ` blocks).
   - Check for existing `<!-- distilled: ... -->` markers. Unless `--force` is specified, skip already distilled blocks.
   - If all blocks are already distilled, report: "Today's note is fully distilled."

### Step 2: High-Signal Extraction (LLM Dehydration)

For each candidate raw segment, extract and structure the Four Pillars Payload:
- **Concept Title**: Clear assertion (e.g., `SOME/IP 接收线程与 Qt GUI 线程的无锁双缓冲机制`)
- **Domain/Category**: `30-Engineering` (Architecture/HMI-3D/Protocols/Traps) or `40-Mathematics`
- **Pillar 1 (Physical Entry)**: Code paths (e.g., `src/communication/someip_receiver.cpp`)
- **Pillar 2 (Symptom vs. Ground Truth)**: Surface symptom vs. actual root cause
- **Pillar 3 (Implicit Contract)**: Invariant rule + Mermaid sequence diagram or LaTeX formula
- **Pillar 4 (Preventative Safeguard)**: Defensive coding rule
- **Raw Snippet / Code Proof**: Minimal code diff or proof snippet

### Step 3: Semantic Deduplication (RAG Matching)

1. Call `obsidian_rag_query` with the extracted concept title and physical entry (limit: 5).
2. Evaluate candidates in `30-Engineering/` or `40-Mathematics/`:
   - **Match Found (Score >= 0.82 or obvious host)**: Choose **Branch A (Subsume)**.
   - **Ambiguous Match (0.65 <= Score < 0.82)**: Present candidate host to user, ask whether to merge as case study or create new card.
   - **No Match (Score < 0.65)** or `--new` specified: Choose **Branch B (Crystallize)**.

### Step 4: Execution (Branch A or Branch B)

#### Branch A: Subsume into Existing Host Card (Case Study Merge)
1. Generate case study markdown:
   ```markdown
   ### 案例：[YYYY-MM-DD] <Title> ^case-<timestamp_id>
   - **来源日记**：[[<source_journal>#<heading>|原始心流日志]]
   - **故障现场/问题背景**：<Symptom>
   - **深层因果链条**：<Root Cause>
   - **根治措施与验证**：<Resolution>
   ```
2. Call `obsidian_insert_at_heading`:
   - `file_path`: `<host_card_path>`
   - `heading`: `"典型故障案例与现场演绎"` (or `"Case Studies"` / `"排障防错与经典案例复盘"`)
   - `content`: Generated case study markdown.

#### Branch B: Crystallize Brand-New Evergreen Note
1. Determine path: e.g. `30-Engineering/30.01-Architecture/<Concept-Name>.md`.
2. Format full Markdown note with Frontmatter (YAML), Four Pillars sections, and Mermaid diagram.
3. Call `obsidian_create_note`:
   - `file_path`: `<target_path>`
   - `content`: Formatted note content.

### Step 5: In-Place Source Tagging (Provenance Backlink)

1. In the originating daily note or draft, format the distillation stamp:
   ```markdown

   > [!abstract] 知识晶体已脱水
   > 本段核心机制已升维沉淀至：[[<target_path>#<case_anchor>|<Concept-Name>]]
   <!-- distilled: [[<target_path>#<case_anchor>]] @ YYYY-MM-DD HH:mm -->
   ```
2. Call `obsidian_replace_in_note` to append this stamp to the processed source section.

### Step 6: Incremental Embedding & MOC Update

1. Call `obsidian_rag_index` on the modified/created target file path to ensure immediate semantic discoverability.
2. If a new note was crystallized in Branch B, suggest running `/moc-update` to register the new note into relevant MOCs.
3. Present a concise summary report showing:
   - Target note path
   - Merge type (Subsumed Case Study vs. Crystallized Evergreen Note)
   - Extracted Implicit Contract & Preventative Safeguard.

---

## Arguments & Flags

- `/distill`: Interactive mode on today's daily note.
- `/distill <keyword>`: Search and distill sections matching keyword.
- `/distill <file_path>`: Distill a specific note or draft file.
- `--dry-run`: Preview extracted Four Pillars and proposed target without writing any files.
- `--new`: Force creating a new mechanism note even if similar note exists.
- `--force`: Ignore existing `<!-- distilled: ... -->` markers and re-distill.
