import { DistilledMarker, DistillPayload, Segment } from './types.js';

/**
 * Regex to detect and parse distilled markers in markdown text.
 * Matches: <!-- distilled: [[Path#Anchor]] @ 2026-10-12 10:30 -->
 */
export const DISTILLED_MARKER_REGEX =
  /<!--\s*distilled:\s*\[\[(?<target>[^#\]]+)(?:#(?<anchor>[^\]]+))?\]\](?:\s*@\s*(?<timestamp>.*?))?\s*-->/i;

/**
 * Checks if a block of text contains a distilled marker.
 */
export function hasDistilledMarker(text: string): boolean {
  return DISTILLED_MARKER_REGEX.test(text);
}

/**
 * Extracts distilled marker details from text if present.
 */
export function extractDistilledMarker(text: string): DistilledMarker | undefined {
  const match = text.match(DISTILLED_MARKER_REGEX);
  if (!match || !match.groups) return undefined;

  return {
    target: match.groups.target.trim(),
    anchor: match.groups.anchor ? match.groups.anchor.trim() : undefined,
    timestamp: match.groups.timestamp ? match.groups.timestamp.trim() : undefined,
    rawMatch: match[0],
  };
}

/**
 * Splits markdown content into logical segments based on H2/H3 headings
 * or standalone sections. Preserves line numbers for precise replacement.
 */
export function parseSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];

  let currentHeading: string | undefined = undefined;
  let currentLines: string[] = [];
  let segmentStartLine = 1;
  let segIndex = 1;

  function flushSegment(endLine: number) {
    if (currentLines.length === 0) return;
    const rawText = currentLines.join('\n');
    const marker = extractDistilledMarker(rawText);

    segments.push({
      id: `seg-${segIndex++}`,
      heading: currentHeading,
      rawText,
      isDistilled: !!marker,
      marker,
      startLine: segmentStartLine,
      endLine,
    });
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);

    if (headingMatch) {
      if (currentLines.length > 0) {
        flushSegment(lineNumber - 1);
      }
      currentHeading = headingMatch[2].trim();
      segmentStartLine = lineNumber;
      currentLines.push(line);
    } else {
      if (currentLines.length === 0 && segments.length === 0) {
        segmentStartLine = lineNumber;
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    flushSegment(lines.length);
  }

  // Filter out purely empty/whitespace segments
  return segments.filter((s) => s.rawText.trim().length > 0);
}

/**
 * Formats a non-destructive provenance stamp to append to the source markdown segment.
 */
export function formatDistilledStamp(
  targetNotePath: string,
  anchor?: string,
  timestamp?: string,
  conceptName?: string
): string {
  const now = timestamp || new Date().toISOString().replace('T', ' ').slice(0, 16);
  const anchorSuffix = anchor ? `#${anchor}` : '';
  const labelSuffix = conceptName ? `|${conceptName}` : '';
  const linkText = `[[${targetNotePath}${anchorSuffix}${labelSuffix}]]`;

  return [
    '',
    '> [!abstract] 知识晶体已脱水',
    `> 本段核心机制已升维沉淀至：${linkText}`,
    `<!-- distilled: [[${targetNotePath}${anchorSuffix}]] @ ${now} -->`,
  ].join('\n');
}

/**
 * Formats a subsumed case study to append into an existing mechanism note.
 */
export function formatSubsumeCase(params: {
  title: string;
  date?: string;
  sourceJournalPath: string;
  sourceAnchor?: string;
  symptom: string;
  rootCause: string;
  resolution: string;
  snippet?: string;
  language?: string;
  timestampId?: string;
}): string {
  const dateStr = params.date || new Date().toISOString().slice(0, 10);
  const tsId = params.timestampId || dateStr.replace(/-/g, '') + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const sourceAnchorRef = params.sourceAnchor ? `#${params.sourceAnchor}` : '';
  const lang = params.language || 'text';

  const codeBlock = params.snippet
    ? `\n- **验证代码/指令**：\n\`\`\`${lang}\n${params.snippet.trim()}\n\`\`\``
    : '';

  return [
    `### 案例：[${dateStr}] ${params.title} ^case-${tsId}`,
    `- **来源日记**：[[${params.sourceJournalPath}${sourceAnchorRef}|原始心流日志]]`,
    `- **故障现场/问题背景**：${params.symptom}`,
    `- **深层因果链条**：${params.rootCause}`,
    `- **根治措施与验证**：${params.resolution}${codeBlock}`,
    '',
  ].join('\n');
}

/**
 * Formats a full Four-Pillars mechanism note with YAML Frontmatter.
 */
export function formatCrystallizeNote(payload: DistillPayload): string {
  const today = new Date().toISOString().slice(0, 10);
  const idStr = today.replace(/-/g, '') + Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  const frontmatterLines = [
    '---',
    `id: ${idStr}`,
    `title: "${payload.title.replace(/"/g, '\\"')}"`,
    'version: "1.0.0"',
    'status: "evergreen"',
    `created: ${today}`,
    `updated: ${today}`,
    'author: "Xiao Tie & Lin Gao"',
    'type: "mechanism"',
    `domain: "${payload.domain || 'engineering'}"`,
  ];

  if (payload.physical_entry && payload.physical_entry.length > 0) {
    frontmatterLines.push('physical_entry:');
    for (const pe of payload.physical_entry) {
      frontmatterLines.push(`  - "${pe}"`);
    }
  }

  if (payload.tags && payload.tags.length > 0) {
    frontmatterLines.push('tags:');
    for (const tag of payload.tags) {
      frontmatterLines.push(`  - ${tag}`);
    }
  }

  if (payload.provenance && payload.provenance.source_file) {
    frontmatterLines.push('sources:');
    const sourceLink = payload.provenance.source_heading
      ? `[[${payload.provenance.source_file}#${payload.provenance.source_heading}]]`
      : `[[${payload.provenance.source_file}]]`;
    frontmatterLines.push(`  - "${sourceLink}"`);
  }

  frontmatterLines.push('---', '');

  // Body with Four Pillars
  const bodyLines = [
    `# ${payload.title}`,
    '',
    '## 1. 物理入口与真实路径 (Physical Entry Points)',
    payload.pillars.physical_context || '暂无物理入口描述。',
    '',
  ];

  if (payload.physical_entry && payload.physical_entry.length > 0) {
    bodyLines.push('**关键物理坐标**：');
    for (const pe of payload.physical_entry) {
      bodyLines.push(`- \`${pe}\``);
    }
    bodyLines.push('');
  }

  bodyLines.push(
    '## 2. 假象 vs 真相 (Symptom vs. Ground Truth)',
    `- **表面现象 (Symptom)**：${payload.pillars.symptom}`,
    `- **物理根因 (Ground Truth)**：${payload.pillars.ground_truth_root_cause}`,
    '',
    '## 3. 隐式契约与数据流拓扑 (Implicit Invariants & Topology)',
    payload.pillars.implicit_contract || '暂无隐式契约说明。',
    ''
  );

  if (payload.pillars.mermaid_diagram) {
    bodyLines.push('```mermaid', payload.pillars.mermaid_diagram.trim(), '```', '');
  }

  if (payload.pillars.latex_formulation) {
    bodyLines.push('$$', payload.pillars.latex_formulation.trim(), '$$', '');
  }

  bodyLines.push(
    '## 4. 避坑军规与防御性编码 (Preventative Action & Anti-Regression)',
    payload.pillars.preventative_safeguard || '遵循防御性编码与类型安全标准。',
    ''
  );

  if (payload.pillars.code_demonstration) {
    const demo = payload.pillars.code_demonstration;
    if (demo.before) {
      bodyLines.push('### 典型错误反例 (Anti-Pattern)', `\`\`\`${demo.language || 'cpp'}`, demo.before.trim(), '```', '');
    }
    bodyLines.push('### 规范防御实现 (Defensive Pattern)', `\`\`\`${demo.language || 'cpp'}`, demo.after.trim(), '```', '');
  }

  bodyLines.push('## 典型故障案例与现场演绎', '');

  return frontmatterLines.join('\n') + bodyLines.join('\n');
}
