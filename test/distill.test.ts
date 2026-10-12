import { describe, it, expect } from 'vitest';
import {
  hasDistilledMarker,
  extractDistilledMarker,
  parseSegments,
  formatDistilledStamp,
  formatSubsumeCase,
  formatCrystallizeNote,
} from '../src/distill/parser';
import { DistillPayload } from '../src/distill/types';

describe('Distill Parser & Formatter', () => {
  describe('Marker Detection & Extraction', () => {
    it('detects standard distilled marker with anchor and timestamp', () => {
      const text = 'Some raw text\n<!-- distilled: [[30-Engineering/QML-Render#case-01]] @ 2026-10-12 18:30 -->';
      expect(hasDistilledMarker(text)).toBe(true);

      const marker = extractDistilledMarker(text);
      expect(marker).toBeDefined();
      expect(marker?.target).toBe('30-Engineering/QML-Render');
      expect(marker?.anchor).toBe('case-01');
      expect(marker?.timestamp).toBe('2026-10-12 18:30');
    });

    it('detects marker without anchor or timestamp', () => {
      const text = 'Log snippet\n<!-- distilled: [[Engineering/SOMEIP-Sync]] -->';
      expect(hasDistilledMarker(text)).toBe(true);

      const marker = extractDistilledMarker(text);
      expect(marker).toBeDefined();
      expect(marker?.target).toBe('Engineering/SOMEIP-Sync');
      expect(marker?.anchor).toBeUndefined();
      expect(marker?.timestamp).toBeUndefined();
    });

    it('returns false for text without marker', () => {
      const text = 'Raw daily notes with no marker.\n- [10:00] Debugging CAN bus.';
      expect(hasDistilledMarker(text)).toBe(false);
      expect(extractDistilledMarker(text)).toBeUndefined();
    });
  });

  describe('Markdown Segmentation', () => {
    it('splits markdown into heading-based segments and tracks line numbers', () => {
      const md = [
        '# Daily Note 2026-10-12',
        '',
        '## Work Log',
        '- [09:00] Standup meeting',
        '- [10:30] Finished PR',
        '',
        '## ADAS Bug Investigation',
        'Frame rate dropped to 15fps.',
        '<!-- distilled: [[30-Engineering/HMI#case-1]] -->',
        '',
        '## Math Study',
        'Studied eigenvalues and shear transform.',
      ].join('\n');

      const segments = parseSegments(md);
      expect(segments.length).toBe(4);

      // Segment 1: Header title
      expect(segments[0].heading).toBeUndefined();
      expect(segments[0].rawText).toContain('# Daily Note 2026-10-12');

      // Segment 2: Work Log
      expect(segments[1].heading).toBe('Work Log');
      expect(segments[1].isDistilled).toBe(false);
      expect(segments[1].rawText).toContain('Standup meeting');

      // Segment 3: ADAS Bug Investigation
      expect(segments[2].heading).toBe('ADAS Bug Investigation');
      expect(segments[2].isDistilled).toBe(true);
      expect(segments[2].marker?.target).toBe('30-Engineering/HMI');
      expect(segments[2].marker?.anchor).toBe('case-1');

      // Segment 4: Math Study
      expect(segments[3].heading).toBe('Math Study');
      expect(segments[3].isDistilled).toBe(false);
      expect(segments[3].rawText).toContain('Studied eigenvalues');
    });
  });

  describe('Formatting Stamps & Case Studies', () => {
    it('formats a non-destructive callout stamp with backlink', () => {
      const stamp = formatDistilledStamp(
        '30-Engineering/QML-Thread-Safety',
        'case-20261012',
        '2026-10-12 19:00',
        'QML跨线程隔离'
      );

      expect(stamp).toContain('> [!abstract] 知识晶体已脱水');
      expect(stamp).toContain('[[30-Engineering/QML-Thread-Safety#case-20261012|QML跨线程隔离]]');
      expect(stamp).toContain('<!-- distilled: [[30-Engineering/QML-Thread-Safety#case-20261012]] @ 2026-10-12 19:00 -->');
    });

    it('formats a subsumed case study with code demonstration', () => {
      const caseStudy = formatSubsumeCase({
        title: 'T12A ADAS 报警丢帧排查',
        date: '2026-10-12',
        sourceJournalPath: '50-Journal/2026-10-12',
        sourceAnchor: 'adas-bug',
        symptom: 'ADAS 报警触发时帧率骤降至 15fps',
        rootCause: '工作线程同步调用 QML 绑定的 Setter 引发 OpenGL 争锁',
        resolution: '改用 emit signal 走 Qt::QueuedConnection 异步队列',
        snippet: 'emit distanceChanged(val);',
        language: 'cpp',
        timestampId: '20261012-001',
      });

      expect(caseStudy).toContain('### 案例：[2026-10-12] T12A ADAS 报警丢帧排查 ^case-20261012-001');
      expect(caseStudy).toContain('[[50-Journal/2026-10-12#adas-bug|原始心流日志]]');
      expect(caseStudy).toContain('ADAS 报警触发时帧率骤降至 15fps');
      expect(caseStudy).toContain('```cpp\nemit distanceChanged(val);\n```');
    });

    it('formats a full Four-Pillars evergreen note with Frontmatter and Mermaid diagram', () => {
      const payload: DistillPayload = {
        concept_name: 'QML-Thread-Safety',
        category: '30-Engineering',
        title: 'QML 渲染主线程与外部数据通信的跨线程隔离契约',
        domain: 'automotive-hmi',
        tags: ['domain/automotive', 'engine/qt', 'perf/fps'],
        physical_entry: ['qt/ic_apps/ic_dashboard/adas_dispatcher.cpp:L45'],
        pillars: {
          physical_context: '位于 ADAS 信号分发与 QML 桥接层。',
          symptom: '高频信号导致 3D 渲染丢帧卡死。',
          ground_truth_root_cause: '非 GUI 线程同步修改 QML 绑定属性引发互斥锁争用。',
          implicit_contract: '所有通信数据跨线程输入 UI，必须使用无锁快照双缓冲或信号槽队列。',
          preventative_safeguard: '严禁在 Worker 线程持有与 UI 共享的全局互斥量。',
          mermaid_diagram: 'sequenceDiagram\n  Rx->>Q: Push\n  GUI->>Q: Pop',
        },
        provenance: {
          source_file: '50-Journal/2026-10-12',
          source_heading: 'Work Log',
          raw_snippet: 'Raw log content',
        },
      };

      const noteContent = formatCrystallizeNote(payload);

      expect(noteContent).toContain('title: "QML 渲染主线程与外部数据通信的跨线程隔离契约"');
      expect(noteContent).toContain('type: "mechanism"');
      expect(noteContent).toContain('## 1. 物理入口与真实路径 (Physical Entry Points)');
      expect(noteContent).toContain('`qt/ic_apps/ic_dashboard/adas_dispatcher.cpp:L45`');
      expect(noteContent).toContain('## 2. 假象 vs 真相 (Symptom vs. Ground Truth)');
      expect(noteContent).toContain('## 3. 隐式契约与数据流拓扑 (Implicit Invariants & Topology)');
      expect(noteContent).toContain('```mermaid\nsequenceDiagram\n  Rx->>Q: Push\n  GUI->>Q: Pop\n```');
      expect(noteContent).toContain('## 4. 避坑军规与防御性编码 (Preventative Action & Anti-Regression)');
    });
  });
});
