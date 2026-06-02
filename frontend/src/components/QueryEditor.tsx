import { createEffect, onCleanup, onMount } from 'solid-js';
import { buildAppUrl } from '../lib/paths';
import type { SchemaObjects } from '../api/types';

export type QueryEditorHandle = {
  focus: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  getSelectedOrCurrentQuery: () => string;
};

type Props = {
  value: string;
  darkMode: boolean;
  visible?: boolean;
  autocompleteObjects: Array<{ name: string; type: keyof SchemaObjects }>;
  onChange: (value: string) => void;
  onRun: () => void;
  onExplain: () => void;
  onReady?: (handle: QueryEditorHandle) => void;
};

type AceEditor = {
  setOptions: (options: Record<string, unknown>) => void;
  setFontSize: (size: number) => void;
  setTheme: (theme: string) => void;
  setShowPrintMargin: (show: boolean) => void;
  getSession: () => {
    setMode: (mode: string) => void;
    setTabSize: (size: number) => void;
    setUseSoftTabs: (value: boolean) => void;
  };
  completers: Array<unknown>;
  commands: {
    addCommands: (commands: Array<unknown>) => void;
  };
  on: (event: string, cb: () => void) => void;
  getValue: () => string;
  setValue: (value: string, cursorPos?: number) => void;
  clearSelection: () => void;
  getSelectedText: () => string;
  getCursorPosition: () => { row: number; column: number };
  selection: {
    setSelectionRange: (range: {
      start: { row: number; column: number };
      end: { row: number; column: number };
    }) => void;
  };
  resize: () => void;
  focus: () => void;
};

declare global {
  interface Window {
    ace?: {
      edit: (id: HTMLElement) => AceEditor;
    };
  }
}

let loader: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.src = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

function loadAce(): Promise<void> {
  if (!loader) {
    const files = [
      buildAppUrl('static/js/ace.js'),
      buildAppUrl('static/js/ace-pgsql.js'),
      buildAppUrl('static/js/ext-language_tools.js'),
      buildAppUrl('static/js/theme-tomorrow.js'),
      buildAppUrl('static/js/theme-tomorrow_night.js'),
    ];

    loader = files.reduce((promise, src) => promise.then(() => loadScript(src)), Promise.resolve());
  }

  return loader;
}

function getSubquery(text: string, cursor: { row: number; column: number }) {
  const lines = text.split('\n');
  let startRow: number | undefined;
  let numChunks = 0;
  const ranges: Array<[number, number]> = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().length === 0) {
      if (startRow !== undefined && cursor.row >= startRow && cursor.row <= i) {
        ranges.push([startRow, i]);
      }

      numChunks += 1;
      startRow = undefined;
      continue;
    }

    if (startRow === undefined) {
      startRow = i;
    }

    if (i === lines.length - 1) {
      ranges.push([startRow, i + 1]);
      numChunks += 1;
    }
  }

  if (ranges.length > 0) {
    return {
      text: lines.slice(ranges[0][0], ranges[0][1]).join('\n'),
      startRow: ranges[0][0],
      endRow: ranges[0][1],
      numChunks,
    };
  }

  return null;
}

export function QueryEditor(props: Props) {
  let host!: HTMLDivElement;
  let editor: AceEditor | null = null;
  let muteChanges = false;

  const getSelectedOrCurrentQuery = () => {
    if (!editor) {
      return props.value.trim();
    }

    const selected = editor.getSelectedText().trim();
    if (selected.length > 0) {
      return selected;
    }

    const query = editor.getValue();
    if (!query.includes(';')) {
      const subquery = getSubquery(query, editor.getCursorPosition());
      if (subquery) {
        if (subquery.numChunks > 1) {
          editor.selection.setSelectionRange({
            start: { row: subquery.startRow, column: 0 },
            end: { row: subquery.endRow, column: 0 },
          });
        }

        return subquery.text;
      }
    }

    return query.trim();
  };

  const handle: QueryEditorHandle = {
    focus: () => editor?.focus(),
    getValue: () => editor?.getValue() ?? props.value,
    setValue: (value: string) => {
      if (!editor) {
        return;
      }

      muteChanges = true;
      editor.setValue(value, -1);
      editor.clearSelection();
      muteChanges = false;
    },
    getSelectedOrCurrentQuery,
  };

  onMount(async () => {
    await loadAce();
    if (!window.ace) {
      return;
    }

    editor = window.ace.edit(host);
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
    });
    editor.setFontSize(13);
    editor.setTheme(props.darkMode ? 'ace/theme/tomorrow_night' : 'ace/theme/tomorrow');
    editor.setShowPrintMargin(false);
    editor.getSession().setMode('ace/mode/pgsql');
    editor.getSession().setTabSize(2);
    editor.getSession().setUseSoftTabs(true);
    editor.completers.push({
      getCompletions: (_editor: unknown, _session: unknown, _pos: unknown, _prefix: unknown, callback: (error: null, result: Array<unknown>) => void) => {
        callback(
          null,
          props.autocompleteObjects.map((item) => ({
            caption: item.name,
            value: item.name,
            meta: item.type,
          })),
        );
      },
    });
    editor.commands.addCommands([
      {
        name: 'run_query',
        bindKey: { win: 'Ctrl-Enter', mac: 'Command-Enter' },
        exec: () => props.onRun(),
      },
      {
        name: 'explain_query',
        bindKey: { win: 'Ctrl-E', mac: 'Command-E' },
        exec: () => props.onExplain(),
      },
    ]);
    editor.on('change', () => {
      if (muteChanges) {
        return;
      }

      props.onChange(editor?.getValue() ?? '');
    });
    handle.setValue(props.value);
    props.onReady?.(handle);
    requestAnimationFrame(() => editor?.resize());
  });

  createEffect(() => {
    if (!editor) {
      return;
    }

    editor.setTheme(props.darkMode ? 'ace/theme/tomorrow_night' : 'ace/theme/tomorrow');
  });

  createEffect(() => {
    if (!editor) {
      return;
    }

    const next = props.value;
    if (next !== editor.getValue()) {
      muteChanges = true;
      editor.setValue(next, -1);
      editor.clearSelection();
      muteChanges = false;
    }
  });

  createEffect(() => {
    if (!editor) {
      return;
    }

    editor.completers.length = 0;
    editor.completers.push({
      getCompletions: (_editor: unknown, _session: unknown, _pos: unknown, _prefix: unknown, callback: (error: null, result: Array<unknown>) => void) => {
        callback(
          null,
          props.autocompleteObjects.map((item) => ({
            caption: item.name,
            value: item.name,
            meta: item.type,
          })),
        );
      },
    });
  });

  createEffect(() => {
    if (!editor || props.visible === false) {
      return;
    }

    requestAnimationFrame(() => editor?.resize());
  });

  onCleanup(() => {
    editor = null;
  });

  return <div id="custom_query" class="query-editor" ref={host} />;
}
