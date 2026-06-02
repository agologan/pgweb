import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from './api/client';
import type {
  ApiError,
  ConnectionInfo,
  FeatureFlags,
  HistoryRecord,
  InfoResponse,
  LocalQuery,
  ObjectsResponse,
  ResultSet,
  SchemaObjects,
  TableInfo,
} from './api/types';
import { ConnectionModal, type ConnectionForm, type ConnectionMode } from './components/ConnectionModal';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { ObjectTree, type SelectedObject } from './components/ObjectTree';
import { QueryEditor, type QueryEditorHandle } from './components/QueryEditor';
import { ResultTable } from './components/ResultTable';
import { buildAppUrl, getBasePath } from './lib/paths';
import { getSessionId } from './lib/session';

type TabId = 'query' | 'rows' | 'structure' | 'indexes' | 'constraints' | 'history' | 'activity' | 'connection';
type ThemeMode = 'light' | 'dark' | 'auto';

type AppState = {
  loading: boolean;
  bootError: string | null;
  info: InfoResponse | null;
  connection: ConnectionInfo | null;
  bookmarks: string[];
  localQueries: LocalQuery[];
  databases: string[];
  schemas: string[];
  objects: ObjectsResponse;
  autocompleteObjects: Array<{ name: string; type: keyof SchemaObjects }>;
  objectFilter: string;
  selectedObject: SelectedObject | null;
  tableInfo: TableInfo | null;
  filterColumns: string[];
  modalOpen: boolean;
  connectMode: ConnectionMode;
  connectForm: ConnectionForm;
  connecting: boolean;
  connectionError: string | null;
  busyObjects: boolean;
  activeTab: TabId;
  queryText: string;
  queryBusy: boolean;
  result: ResultSet | null;
  resultView: { title: string; content: string } | null;
  resultMeta: string | null;
  queryResult: ResultSet | null;
  queryResultView: { title: string; content: string } | null;
  queryResultMeta: string | null;
  sortColumn: string | null;
  sortOrder: 'ASC' | 'DESC' | null;
  page: number;
  rowsLimit: number;
  filterColumn: string;
  filterOp: string;
  filterValue: string;
  cellModal: string | null;
  theme: ThemeMode;
  darkMode: boolean;
  databaseSearchOpen: boolean;
  databaseSearchValue: string;
  contextMenu: {
    open: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
  };
};

const tabItems: Array<{ id: TabId; label: string }> = [
  { id: 'rows', label: 'Rows' },
  { id: 'structure', label: 'Structure' },
  { id: 'indexes', label: 'Indexes' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'query', label: 'Query' },
  { id: 'history', label: 'History' },
  { id: 'activity', label: 'Activity' },
  { id: 'connection', label: 'Connection' },
];

const filterOptions: Record<string, string> = {
  equal: "= 'DATA'",
  not_equal: "!= 'DATA'",
  greater: "> 'DATA'",
  greater_eq: ">= 'DATA'",
  less: "< 'DATA'",
  less_eq: "<= 'DATA'",
  like: "LIKE 'DATA'",
  ilike: "ILIKE 'DATA'",
  null: 'IS NULL',
  not_null: 'IS NOT NULL',
};

function emptyForm(): ConnectionForm {
  return {
    bookmarkId: '',
    url: '',
    host: '',
    port: '5432',
    user: '',
    password: '',
    database: '',
    sslMode: 'require',
    sshHost: '',
    sshPort: '22',
    sshUser: '',
    sshPassword: '',
    sshKey: '',
    sshKeyPassword: '',
  };
}

function getStoredRowsLimit(): number {
  const value = window.localStorage.getItem('rows_limit');
  const parsed = value ? Number.parseInt(value, 10) : 100;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function getStoredTab(): TabId {
  const value = window.sessionStorage.getItem('tab') as TabId | null;
  return value ?? 'query';
}

function getStoredTheme(): ThemeMode {
  const value = window.localStorage.getItem('theme') as ThemeMode | null;
  return value ?? 'auto';
}

function getStoredQuery(): string {
  return window.localStorage.getItem('pgweb_query') ?? '';
}

function getActualTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return theme;
}

function applyTheme(theme: ThemeMode) {
  const actual = getActualTheme(theme);
  document.documentElement.setAttribute('data-bs-theme', actual);
  window.localStorage.setItem('theme', theme);
  return actual === 'dark';
}

function getThemeIcon(theme: ThemeMode): string {
  if (theme === 'light') return 'fa-lightbulb-o';
  if (theme === 'dark') return 'fa-moon-o';
  return 'fa-adjust';
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    return String((error as ApiError).error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function buildConnectionUrl(form: ConnectionForm, mode: ConnectionMode): string {
  if (mode === 'scheme') {
    const raw = form.url.trim();
    if (!raw) return '';

    if ((raw.includes('localhost') || raw.includes('127.0.0.1')) && !raw.includes('sslmode=')) {
      const separator = raw.includes('?') ? '&' : '?';
      return `${raw}${separator}sslmode=${form.sslMode}`;
    }

    return raw;
  }

  const port = form.port.trim() || '5432';
  const password = encodeURIComponent(form.password);
  return `postgres://${form.user}:${password}@${form.host}:${port}/${form.database}?sslmode=${form.sslMode}`;
}

function getQuotedSchemaTableName(table: string): string {
  if (!table.includes('.')) return table;
  const [schema, name] = table.split('.');
  return `"${schema}"."${name}"`;
}

function makeKeyValueResult(data: Record<string, unknown>): ResultSet {
  return {
    columns: ['attribute', 'value'],
    rows: Object.entries(data).map(([key, value]) => [key, value == null ? '' : String(value)]),
  };
}

function makeHistoryResult(data: HistoryRecord[]): ResultSet {
  return {
    columns: ['id', 'query', 'timestamp'],
    rows: data.map((item, index) => [index + 1, item.query, item.timestamp]).reverse(),
  };
}

function buildAutocompleteObjects(objects: ObjectsResponse): Array<{ name: string; type: keyof SchemaObjects }> {
  const items: Array<{ name: string; type: keyof SchemaObjects }> = [];

  Object.values(objects).forEach((groups) => {
    (['table', 'view', 'materialized_view', 'function'] as Array<keyof SchemaObjects>).forEach((group) => {
      groups[group].forEach((item) => items.push({ name: item.name, type: group }));
    });
  });

  return items;
}

function extractFilterColumns(result: ResultSet | null): string[] {
  if (!result) return [];
  return result.rows.map((row) => String(row[0] ?? '')).filter(Boolean);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

export default function App() {
  let editorHandle: QueryEditorHandle | undefined;
  let databaseInputRef: HTMLSelectElement | undefined;
  const initialTheme = getStoredTheme();

  const [state, setState] = createStore<AppState>({
    loading: true,
    bootError: null,
    info: null,
    connection: null,
    bookmarks: [],
    localQueries: [],
    databases: [],
    schemas: [],
    objects: {},
    autocompleteObjects: [],
    objectFilter: '',
    selectedObject: null,
    tableInfo: null,
    filterColumns: [],
    modalOpen: false,
    connectMode: 'standard',
    connectForm: emptyForm(),
    connecting: false,
    connectionError: null,
    busyObjects: false,
    activeTab: getStoredTab(),
    queryText: getStoredQuery(),
    queryBusy: false,
    result: null,
    resultView: null,
    resultMeta: null,
    queryResult: null,
    queryResultView: null,
    queryResultMeta: null,
    sortColumn: null,
    sortOrder: null,
    page: 1,
    rowsLimit: getStoredRowsLimit(),
    filterColumn: '',
    filterOp: '',
    filterValue: '',
    cellModal: null,
    theme: initialTheme,
    darkMode: applyTheme(initialTheme),
    databaseSearchOpen: false,
    databaseSearchValue: '',
    contextMenu: {
      open: false,
      x: 0,
      y: 0,
      items: [],
    },
  });

  const connected = createMemo(() => state.connection !== null);
  const tableLike = createMemo(() => state.selectedObject && !['function', 'sequence'].includes(state.selectedObject.type));
  const features = createMemo<FeatureFlags>(() =>
    state.info?.features ?? {
      session_lock: false,
      query_timeout: null,
      local_queries: false,
      bookmarks_only: false,
    },
  );
  const bodyClass = createMemo(() => {
    if (state.activeTab === 'query') return '';
    if (state.activeTab === 'rows') return 'with-pagination';
    return 'full';
  });
  const showInput = createMemo(() => state.activeTab === 'query');
  const showConnectionActions = createMemo(() => connected() && !features().session_lock);
  const currentDatabase = createMemo(() => String(state.connection?.current_database ?? ''));
  const selectedTableExport = createMemo(() => (tableLike() && state.selectedObject ? getQuotedSchemaTableName(state.selectedObject.id) : null));
  const resultsMode = createMemo(() => (state.activeTab === 'rows' ? 'browse' : 'query'));
  const resultCountText = createMemo(() => (state.activeTab === 'query' ? state.queryResultMeta : state.resultMeta) ?? '');

  createEffect(() => {
    window.localStorage.setItem('pgweb_query', state.queryText);
  });

  createEffect(() => {
    window.sessionStorage.setItem('tab', state.activeTab);
  });

  createEffect(() => {
    window.localStorage.setItem('rows_limit', String(state.rowsLimit));
  });

  createEffect(() => {
    if (state.databaseSearchOpen) {
      requestAnimationFrame(() => {
        databaseInputRef?.focus();

        const picker = databaseInputRef as HTMLSelectElement & {
          showPicker?: () => void;
        };

        if (picker?.showPicker) {
          picker.showPicker();
        } else {
          picker?.click();
        }
      });
    }
  });

  async function loadBookmarks() {
    try {
      setState('bookmarks', await api.getBookmarks());
    } catch {
      setState('bookmarks', []);
    }
  }

  async function loadDatabases() {
    if (!connected() || features().session_lock) {
      setState('databases', []);
      return;
    }

    try {
      setState('databases', await api.getDatabases());
    } catch {
      setState('databases', []);
    }
  }

  async function loadLocalQueries() {
    if (!features().local_queries || !connected()) {
      setState('localQueries', []);
      return;
    }

    try {
      setState('localQueries', await api.getLocalQueries());
    } catch {
      setState('localQueries', []);
    }
  }

  async function refreshObjects() {
    if (!connected()) {
      setState({ schemas: [], objects: {}, autocompleteObjects: [], selectedObject: null, tableInfo: null, filterColumns: [] });
      return;
    }

    setState('busyObjects', true);

    try {
      const [schemas, objects] = await Promise.all([api.getSchemas(), api.getObjects()]);
      setState('schemas', schemas);
      setState('objects', objects);
      setState('autocompleteObjects', buildAutocompleteObjects(objects));
    } catch (error) {
      setState('bootError', getErrorMessage(error));
    } finally {
      setState('busyObjects', false);
    }
  }

  async function refreshConnection() {
    try {
      const connection = await api.getConnection();
      setState('connection', connection);
      setState('databaseSearchValue', String(connection.current_database ?? ''));
      await Promise.all([refreshObjects(), loadDatabases(), loadLocalQueries()]);
    } catch {
      setState({
        connection: null,
        databaseSearchValue: '',
        schemas: [],
        objects: {},
        autocompleteObjects: [],
        selectedObject: null,
        tableInfo: null,
        filterColumns: [],
        result: null,
        resultView: null,
        resultMeta: null,
        queryResult: null,
        queryResultView: null,
        queryResultMeta: null,
        localQueries: [],
      });
    }
  }

  async function bootstrap() {
    setState({ loading: true, bootError: null });

    try {
      const info = await api.getInfo();
      setState('info', info);
      await Promise.all([loadBookmarks(), refreshConnection()]);
      setState('modalOpen', state.connection === null);
    } catch (error) {
      setState('bootError', getErrorMessage(error));
      setState('modalOpen', true);
    } finally {
      setState('loading', false);
    }
  }

  onMount(() => {
    bootstrap();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (state.theme === 'auto') {
        setState('darkMode', applyTheme('auto'));
      }
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  });

  async function loadCurrentObjectSummary(item: SelectedObject) {
    if (item.type === 'function' || item.type === 'sequence') {
      setState({ tableInfo: null, filterColumns: [] });
      return;
    }

    try {
      const [info, structure] = await Promise.all([api.getTableInfo(item.id), api.getTableStructure(item.id, item.type)]);
      setState('tableInfo', info);
      setState('filterColumns', extractFilterColumns(structure));
    } catch {
      setState({ tableInfo: null, filterColumns: [] });
    }
  }

  async function selectObject(item: SelectedObject) {
    setState('selectedObject', item);
    setState('page', 1);
    setState('sortColumn', null);
    setState('sortOrder', null);
    setState('filterColumn', '');
    setState('filterOp', '');
    setState('filterValue', '');
    await loadCurrentObjectSummary(item);

    if (item.type === 'function' || item.type === 'sequence') {
      await openTab('structure');
      return;
    }

    switch (state.activeTab) {
      case 'rows':
        await openTab('rows');
        break;
      case 'structure':
        await openTab('structure');
        break;
      case 'indexes':
        await openTab('indexes');
        break;
      case 'constraints':
        await openTab('constraints');
        break;
      default:
        await openTab('rows');
        break;
    }
  }

  async function connect() {
    setState({ connecting: true, connectionError: null });

    try {
      const params: Record<string, string | number> = {};
      const bookmarkId = state.connectForm.bookmarkId.trim();

      if (bookmarkId) {
        params.bookmark_id = bookmarkId;
      } else {
        const url = buildConnectionUrl(state.connectForm, state.connectMode);
        if (!url) throw { error: 'Connection URL required' } satisfies ApiError;

        params.url = url;

        if (state.connectMode === 'ssh') {
          params.ssh = 1;
          params.ssh_host = state.connectForm.sshHost;
          params.ssh_port = state.connectForm.sshPort;
          params.ssh_user = state.connectForm.sshUser;
          params.ssh_password = state.connectForm.sshPassword;
          params.ssh_key = state.connectForm.sshKey;
          params.ssh_key_password = state.connectForm.sshKeyPassword;
        }
      }

      const connection = await api.connect(params);
      setState('connection', connection);
      setState('databaseSearchValue', String(connection.current_database ?? ''));
      setState('modalOpen', false);
      setState('connectForm', emptyForm());
      await Promise.all([refreshObjects(), loadDatabases(), loadLocalQueries()]);
      editorHandle?.focus();
    } catch (error) {
      setState('connectionError', getErrorMessage(error));
    } finally {
      setState('connecting', false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Are you sure you want to disconnect?')) return;

    try {
      await api.disconnect();
    } catch {
      // ignore
    }

    await refreshConnection();
    setState('modalOpen', true);
  }

  function updateForm(field: keyof ConnectionForm, value: string) {
    setState('connectionError', null);
    setState('connectForm', field, value);

    if ((field === 'host' || field === 'url') && (value.includes('localhost') || value.includes('127.0.0.1'))) {
      setState('connectForm', 'sslMode', 'disable');
    }
  }

  function updateMode(mode: ConnectionMode) {
    setState('connectMode', mode);
    setState('connectionError', null);
  }

  function currentQuery(): string {
    return editorHandle?.getSelectedOrCurrentQuery()?.trim() ?? state.queryText.trim();
  }

  function describeResult(result: ResultSet | null): string {
    if (!result) return '';
    if (result.stats) {
      return `${result.stats.rows_count} rows in ${result.stats.query_duration_ms} ms`;
    }
    return `${result.rows.length} rows`;
  }

  function setResult(result: ResultSet | null) {
    setState('result', result);
    setState('resultMeta', describeResult(result));
  }

  function setQueryResult(result: ResultSet | null) {
    setState('queryResult', result);
    setState('queryResultMeta', describeResult(result));
  }

  async function runQuery(kind: 'query' | 'explain' | 'analyze') {
    const query = currentQuery();
    if (!query) return;

    setState('activeTab', 'query');
    setState('queryBusy', true);
    setState('queryResultView', null);
    setQueryResult(null);

    try {
      const result =
        kind === 'query'
          ? await api.runQuery(query)
          : kind === 'explain'
            ? await api.explainQuery(query)
            : await api.analyzeQuery(query);

      setQueryResult(result);

      if (/(create|drop)\s/i.test(query)) {
        await refreshObjects();
      }
    } catch (error) {
      setQueryResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  function exportQuery(format: 'csv' | 'json' | 'xml') {
    const query = currentQuery();
    if (!query) return;
    window.open(api.buildQueryExportUrl(format, query), '_blank')?.focus();
  }

  async function loadRows() {
    if (!state.selectedObject || !tableLike()) {
      setResult({ columns: [], rows: [], error: 'Please select a table!' });
      return;
    }

    const params: Record<string, string | number> = {
      limit: state.rowsLimit,
      offset: (state.page - 1) * state.rowsLimit,
    };

    if (state.sortColumn) {
      params.sort_column = state.sortColumn;
      params.sort_order = state.sortOrder ?? 'ASC';
    }

    if (state.filterColumn && state.filterOp) {
      const template = filterOptions[state.filterOp];
      if (template) {
        if (template.includes('DATA') && !state.filterValue) {
          throw { error: 'Please specify filter query' } satisfies ApiError;
        }

        params.where = `"${state.filterColumn}" ${template.replace('DATA', state.filterValue)}`;
      }
    }

    setResult(await api.getTableRows(state.selectedObject.id, params));
    setState('resultView', null);
  }

  async function loadStructure() {
    if (!state.selectedObject) {
      setResult({ columns: [], rows: [], error: 'Please select a table!' });
      return;
    }

    if (state.selectedObject.type === 'sequence') {
      setResult({ columns: [], rows: [], error: 'Sequence structure view not implemented yet.' });
      return;
    }

    const result = await api.getTableStructure(state.selectedObject.id, state.selectedObject.type);

    if (state.selectedObject.type === 'function' && result.rows[0]) {
      const nameIndex = result.columns.indexOf('proname');
      const defIndex = result.columns.indexOf('functiondef');
      setState('resultView', {
        title: `Function definition for: ${String(result.rows[0][nameIndex] ?? state.selectedObject.name)}`,
        content: String(result.rows[0][defIndex] ?? ''),
      });
      setResult(null);
      return;
    }

    setState('resultView', null);
    setResult(result);
  }

  async function loadIndexes() {
    if (!state.selectedObject) {
      setResult({ columns: [], rows: [], error: 'Please select a table!' });
      return;
    }

    setState('resultView', null);
    setResult(await api.getTableIndexes(state.selectedObject.id));
  }

  async function loadConstraints() {
    if (!state.selectedObject) {
      setResult({ columns: [], rows: [], error: 'Please select a table!' });
      return;
    }

    setState('resultView', null);
    setResult(await api.getTableConstraints(state.selectedObject.id));
  }

  async function loadHistory() {
    setState('resultView', null);
    setResult(makeHistoryResult(await api.getHistory()));
  }

  async function loadActivity() {
    setState('resultView', null);
    setResult(await api.getActivity());
  }

  async function loadConnectionInfo() {
    const connection = await api.getConnection();
    setState('connection', connection);
    setState('resultView', null);
    setResult(makeKeyValueResult(connection));
  }

  async function showServerSettings() {
    setState('activeTab', 'connection');
    setState('queryBusy', true);
    try {
      setState('resultView', null);
      setResult(await api.getServerSettings());
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function showDatabaseStats() {
    setState('activeTab', 'connection');
    setState('queryBusy', true);
    try {
      setState('resultView', null);
      setResult(await api.getTablesStats());
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function showViewDefinition() {
    if (!state.selectedObject || !['view', 'materialized_view'].includes(state.selectedObject.type)) return;

    setState('activeTab', 'structure');
    setState('queryBusy', true);
    try {
      const result = await api.runQuery(`SELECT pg_get_viewdef('${state.selectedObject.id}', true);`);
      setState('resultView', {
        title: `View definition for: ${state.selectedObject.name}`,
        content: String(result.rows[0]?.[0] ?? ''),
      });
      setResult(null);
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function analyzeCurrentTable() {
    if (!state.selectedObject || state.selectedObject.type !== 'table') return;
    if (!window.confirm(`Are you sure you want to analyze table ${state.selectedObject.id} ?`)) return;

    setState('queryBusy', true);
    try {
      await api.runQuery(`ANALYZE ${getQuotedSchemaTableName(state.selectedObject.id)}`);
      await loadCurrentObjectSummary(state.selectedObject);
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function stopQuery(pid: string) {
    if (!window.confirm('Are you sure you want to stop the query?')) return;
    await api.runQuery(`SELECT pg_cancel_backend(${pid});`);
    await openTab('activity');
  }

  async function openTab(tab: TabId) {
    setState('activeTab', tab);

    if (tab === 'query') {
      editorHandle?.focus();
      return;
    }

    setState('queryBusy', true);
    try {
      switch (tab) {
        case 'rows':
          await loadRows();
          break;
        case 'structure':
          await loadStructure();
          break;
        case 'indexes':
          await loadIndexes();
          break;
        case 'constraints':
          await loadConstraints();
          break;
        case 'history':
          await loadHistory();
          break;
        case 'activity':
          await loadActivity();
          break;
        case 'connection':
          await loadConnectionInfo();
          break;
        default:
          break;
      }
    } catch (error) {
      setState('resultView', null);
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function switchDatabaseByValue(value: string) {
    if (!value || value === currentDatabase()) {
      setState('databaseSearchOpen', false);
      setState('databaseSearchValue', currentDatabase());
      return;
    }

    setState('queryBusy', true);

    try {
      await api.switchDatabase(value);
      setState('databaseSearchOpen', false);
      setState('selectedObject', null);
      setState('tableInfo', null);
      setState('filterColumns', []);
      setState('objectFilter', '');
      setResult(null);
      setQueryResult(null);
      await refreshConnection();
      await openTab('query');
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    } finally {
      setState('queryBusy', false);
    }
  }

  async function loadLocalQuery(id: string) {
    if (!id) return;

    try {
      const localQuery = await api.getLocalQuery(id);
      setState('queryText', localQuery.query);
      editorHandle?.setValue(localQuery.query);
      await openTab('query');
    } catch (error) {
      setResult({ columns: [], rows: [], error: getErrorMessage(error) });
    }
  }

  function cycleTheme() {
    const modes: ThemeMode[] = ['light', 'dark', 'auto'];
    const next = modes[(modes.indexOf(state.theme) + 1) % modes.length];
    setState('theme', next);
    setState('darkMode', applyTheme(next));
  }

  function closeContextMenu() {
    setState('contextMenu', { open: false, x: 0, y: 0, items: [] });
  }

  function openContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
    event.preventDefault();
    setState('contextMenu', {
      open: true,
      x: event.clientX,
      y: event.clientY,
      items,
    });
  }

  async function deleteTable(table: string) {
    if (!window.confirm(`Are you sure you want to delete table ${table} ?`)) return;
    await api.runQuery(`DROP TABLE ${getQuotedSchemaTableName(table)}`);
    await refreshObjects();
    setResult(null);
  }

  async function truncateTable(table: string) {
    if (!window.confirm(`Are you sure you want to truncate table ${table} ?`)) return;
    await api.runQuery(`TRUNCATE TABLE ${getQuotedSchemaTableName(table)}`);
    if (state.activeTab === 'rows') await openTab('rows');
  }

  async function deleteView(table: string) {
    if (!window.confirm(`Are you sure you want to delete view ${table} ?`)) return;
    await api.runQuery(`DROP VIEW ${getQuotedSchemaTableName(table)}`);
    await refreshObjects();
    setResult(null);
  }

  async function copyViewDefinition(table: string) {
    const result = await api.runQuery(`SELECT pg_get_viewdef('${escapeSqlLiteral(table)}', true);`);
    await copyToClipboard(String(result.rows[0]?.[0] ?? ''));
  }

  async function showUniqueValues(column: string, counts: boolean) {
    if (!state.selectedObject) return;
    const table = getQuotedSchemaTableName(state.selectedObject.id);
    const query = counts
      ? `SELECT DISTINCT "${column}", COUNT(1) AS total_count FROM ${table} GROUP BY "${column}" ORDER BY total_count DESC`
      : `SELECT DISTINCT "${column}" FROM ${table}`;
    setState('activeTab', 'query');
    setState('queryResultView', null);
    setQueryResult(await api.runQuery(query));
  }

  async function showNumericStats(column: string) {
    if (!state.selectedObject) return;
    const table = getQuotedSchemaTableName(state.selectedObject.id);
    setState('activeTab', 'query');
    setState('queryResultView', null);
    setQueryResult(await api.runQuery(`SELECT count(1), min("${column}"), max("${column}"), avg("${column}") FROM ${table}`));
  }

  async function filterRowsByValue(columnIndex: number, value: string) {
    const name = state.result?.columns[columnIndex] ?? '';
    setState('filterColumn', String(name));
    setState('filterOp', 'equal');
    setState('filterValue', value);
    setState('page', 1);
    await openTab('rows');
  }

  const [legacyTemplate, setLegacyTemplate] = createSignal('');

  return (
    <>
      <div id="main" classList={{ hidden: !connected() }}>
        <div id="nav">
          <ul>
            <For each={tabItems}>
              {(tab) => (
                <li id={`table_${tab.id === 'rows' ? 'content' : tab.id}`} classList={{ selected: state.activeTab === tab.id }} onClick={() => openTab(tab.id)}>
                  {tab.label}
                </li>
              )}
            </For>
            <li id="theme_switcher" onClick={cycleTheme}>
              <i class={`fa ${getThemeIcon(state.theme)}`}></i>
            </li>
          </ul>

          <div class="connection-actions" style={{ display: showConnectionActions() ? 'block' : 'none' }}>
            <a href="#" id="edit_connection" class="btn btn-outline-secondary btn-sm" onClick={(event) => { event.preventDefault(); setState('modalOpen', true); }}>
              <i class="fa fa-database"></i> Connect
            </a>
            <a href="#" id="close_connection" class="btn btn-outline-secondary btn-sm" onClick={(event) => { event.preventDefault(); disconnect(); }}>
              Disconnect
            </a>
          </div>
        </div>

        <div id="sidebar">
          <div class="current-database">
            <div class="wrap">
              <i class="fa fa-database"></i>
              <span
                classList={{ 'current-database-name': true, hidden: state.databaseSearchOpen }}
                id="current_database"
                onClick={async () => {
                  await loadDatabases();
                  if (state.databases.length === 0) return;
                  setState('databaseSearchValue', currentDatabase());
                  setState('databaseSearchOpen', true);
                }}
                onContextMenu={(event) =>
                  openContextMenu(event, [
                    { label: 'Show Database Stats', action: showDatabaseStats },
                    { label: 'Download Database Stats', action: () => window.open(api.buildDatabaseStatsExportUrl(), '_blank')?.focus() },
                    { divider: true, label: '', action: () => {} },
                    { label: 'Show Server Settings', action: showServerSettings },
                    { divider: true, label: '', action: () => {} },
                    { label: 'Export SQL dump', action: () => window.open(api.buildDumpUrl(), '_blank')?.focus() },
                  ])
                }
              >
                {currentDatabase()}
              </span>
              <select
                ref={databaseInputRef}
                classList={{ typeahead: true, 'database-switch-input': true, hidden: !state.databaseSearchOpen }}
                id="database_search"
                value={state.databaseSearchValue}
                onChange={(event) => switchDatabaseByValue(event.currentTarget.value)}
                onBlur={() => {
                  window.setTimeout(() => {
                    setState('databaseSearchOpen', false);
                    setState('databaseSearchValue', currentDatabase());
                  }, 150);
                }}
              >
                <For each={state.databases}>{(name) => <option value={name}>{name}</option>}</For>
              </select>
              <span class="refresh" id="refresh_tables" title="Refresh tables list" onClick={refreshObjects}>
                <i class="fa fa-refresh"></i>
              </span>
            </div>
          </div>

          <div class="objects-search">
            <div class="wrap">
              <i class="fa fa-search"></i>
              <i
                class="fa fa-times-circle clear-objects-filter"
                style={{ display: state.objectFilter ? 'block' : 'none' }}
                onClick={() => setState('objectFilter', '')}
              ></i>
              <input
                type="text"
                placeholder="Filter database objects"
                id="filter_database_objects"
                value={state.objectFilter}
                onInput={(event) => setState('objectFilter', event.currentTarget.value)}
              />
            </div>
          </div>

          <div class="tables-list">
            <div class="wrap">
              <ObjectTree
                schemas={state.schemas}
                objects={state.objects}
                filter={state.objectFilter}
                selectedId={state.selectedObject?.id ?? null}
                onFilterChange={(value) => setState('objectFilter', value)}
                onRefresh={refreshObjects}
                onSelect={selectObject}
                onItemContextMenu={(event, item) => {
                  if (item.type === 'table') {
                    openContextMenu(event, [
                      { label: 'Copy Table Name', action: () => copyToClipboard(item.name) },
                      {
                        label: 'Analyze Table',
                        action: async () => {
                          await api.runQuery(`ANALYZE ${getQuotedSchemaTableName(item.id)}`);
                        },
                      },
                      { divider: true, label: '', action: () => {} },
                      { label: 'Export to JSON', action: () => window.open(api.buildTableExportUrl('json', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { label: 'Export to CSV', action: () => window.open(api.buildTableExportUrl('csv', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { label: 'Export to XML', action: () => window.open(api.buildTableExportUrl('xml', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { label: 'Export to SQL', action: () => window.open(api.buildDumpUrl(getQuotedSchemaTableName(item.id)), '_blank')?.focus() },
                      { divider: true, label: '', action: () => {} },
                      { label: 'Truncate Table', action: () => truncateTable(item.id), danger: true },
                      { label: 'Delete Table', action: () => deleteTable(item.id), danger: true },
                    ]);
                    return;
                  }

                  if (item.type === 'view' || item.type === 'materialized_view') {
                    openContextMenu(event, [
                      { label: 'View Definition', action: async () => { await selectObject(item); await showViewDefinition(); } },
                      { label: 'Copy View Name', action: () => copyToClipboard(item.name) },
                      { label: 'Copy View Definition', action: () => copyViewDefinition(item.id) },
                      { divider: true, label: '', action: () => {} },
                      { label: 'Export to JSON', action: () => window.open(api.buildTableExportUrl('json', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { label: 'Export to CSV', action: () => window.open(api.buildTableExportUrl('csv', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { label: 'Export to XML', action: () => window.open(api.buildTableExportUrl('xml', getQuotedSchemaTableName(item.id), currentDatabase()), '_blank')?.focus() },
                      { divider: true, label: '', action: () => {} },
                      { label: 'Delete View', action: () => deleteView(item.id), danger: true },
                    ]);
                    return;
                  }

                  if (item.type === 'function') {
                    openContextMenu(event, [{ label: 'Copy Function Name', action: () => copyToClipboard(item.name) }]);
                    return;
                  }

                  if (item.type === 'sequence') {
                    openContextMenu(event, [{ label: 'Copy Sequence Name', action: () => copyToClipboard(item.name) }]);
                  }
                }}
              />
            </div>
          </div>

          <div class="table-information">
            <div class="wrap">
              <div class="title">Table Information</div>
              <div class="lines" style={{ display: state.tableInfo ? 'block' : 'none' }}>
                <div class="line">Size: <span id="table_total_size">{String(state.tableInfo?.total_size ?? '')}</span></div>
                <div class="line">Data size: <span id="table_data_size">{String(state.tableInfo?.data_size ?? '')}</span></div>
                <div class="line">Index size: <span id="table_index_size">{String(state.tableInfo?.index_size ?? '')}</span></div>
                <div class="line">Estimated rows: <span id="table_rows_count">{String(state.tableInfo?.rows_count ?? '')}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div id="body" class={bodyClass()}>
          <div id="input" style={{ display: showInput() ? 'block' : 'none' }}>
            <div class="input-wrapper">
              <QueryEditor
                value={state.queryText}
                darkMode={state.darkMode}
                visible={showInput()}
                autocompleteObjects={state.autocompleteObjects}
                onChange={(value) => setState('queryText', value)}
                onRun={() => runQuery('query')}
                onExplain={() => runQuery('explain')}
                onReady={(handle) => {
                  editorHandle = handle;
                  if (state.activeTab === 'query') handle.focus();
                }}
              />
            </div>
            <div class="actions">
              <button type="button" id="run" class="btn btn-sm btn-outline-success" onClick={() => runQuery('query')} disabled={state.queryBusy}>
                Run Query
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => runQuery('explain')} disabled={state.queryBusy}>
                Explain Query
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => runQuery('analyze')} disabled={state.queryBusy}>
                Analyze Query
              </button>

              <div id="load-query-dropdown" class="btn-group-inline left" style={{ display: state.localQueries.length ? 'block' : 'none' }}>
                <select
                  class="form-select form-select-sm"
                  value={legacyTemplate()}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setLegacyTemplate(value);
                    loadLocalQuery(value);
                  }}
                >
                  <option value="">Template</option>
                  <For each={state.localQueries}>{(item) => <option value={item.id}>{item.title || item.id}</option>}</For>
                </select>
              </div>

              <div id="query_progress" style={{ display: state.queryBusy ? 'block' : 'none' }}>
                Please wait, query is executing...
              </div>
              <div class="pull-right">
                <span id="result-rows-count">{resultCountText()}</span>
                <button type="button" id="json" class="btn btn-sm btn-outline-secondary" onClick={() => exportQuery('json')}>JSON</button>
                <button type="button" id="csv" class="btn btn-sm btn-outline-secondary" onClick={() => exportQuery('csv')}>CSV</button>
                <button type="button" id="xml" class="btn btn-sm btn-outline-secondary" onClick={() => exportQuery('xml')}>XML</button>
              </div>
            </div>
            <div id="input_resize_handler"></div>
          </div>

          <div id="output">
            <div class="wrapper">
              <Show when={state.activeTab === 'query' ? !state.queryResultView : !state.resultView}>
                <ResultTable
                  result={state.activeTab === 'query' ? state.queryResult : state.result}
                  mode={state.activeTab === 'rows' ? 'browse' : 'query'}
                  sortColumn={state.sortColumn}
                  sortOrder={state.sortOrder}
                  rowAction={state.activeTab === 'activity' ? { label: 'stop', column: 'pid', variant: 'danger', onClick: stopQuery } : undefined}
                  onSort={(column, nextOrder) => {
                    if (state.activeTab !== 'rows') return;
                    setState('sortColumn', column);
                    setState('sortOrder', nextOrder);
                    openTab('rows');
                  }}
                  onCellOpen={(value) => setState('cellModal', value)}
                  onHeaderContextMenu={(event, column) => {
                    if (state.activeTab !== 'rows' || !state.selectedObject) return;
                    openContextMenu(event, [
                      { label: 'Unique Values', action: () => showUniqueValues(column, false) },
                      { label: 'Unique Values + Counts', action: () => showUniqueValues(column, true) },
                      { label: 'Numeric stats (min/max/avg)', action: () => showNumericStats(column) },
                      { label: 'Copy Column Name', action: () => copyToClipboard(column) },
                    ]);
                  }}
                  onCellContextMenu={(event, value, columnIndex) => {
                    openContextMenu(event, [
                      { label: 'Display Value', action: () => setState('cellModal', value) },
                      { label: 'Copy Value', action: () => copyToClipboard(value) },
                      {
                        label: 'Filter Rows By Value',
                        action: () => filterRowsByValue(columnIndex, value),
                        disabled: state.activeTab !== 'rows',
                      },
                    ]);
                  }}
                />
              </Show>

              <div id="results_view" style={{ display: state.activeTab === 'query' ? (state.queryResultView ? 'block' : 'none') : (state.resultView ? 'block' : 'none') }}>
                <Show when={state.activeTab === 'query' ? state.queryResultView : state.resultView}>
                  {(view) => (
                    <>
                      <div class="title" innerHTML={view().title}></div>
                      <pre>
                        {view().content}
                        <div class="copy" onClick={() => copyToClipboard(view().content)}>
                          <i class="fa fa-copy"></i>
                        </div>
                      </pre>
                    </>
                  )}
                </Show>
              </div>
            </div>
          </div>

          <div id="pagination">
            <form
              class="filters"
              action="#"
              id="rows_filter"
              onSubmit={(event) => {
                event.preventDefault();
                setState('page', 1);
                openTab('rows');
              }}
            >
              <span>Search</span>
              <select class="column form-select" value={state.filterColumn} onChange={(event) => setState('filterColumn', event.currentTarget.value)}>
                <option value="">Select column</option>
                <For each={state.filterColumns}>{(column) => <option value={column}>{column}</option>}</For>
              </select>
              <select class="filter form-select" value={state.filterOp} onChange={(event) => setState('filterOp', event.currentTarget.value)}>
                <option value="">Select filter</option>
                <option value="equal">=</option>
                <option value="not_equal">≠</option>
                <option value="greater">&gt;</option>
                <option value="greater_eq">≥</option>
                <option value="less">&lt;</option>
                <option value="less_eq">≤</option>
                <option value="like">LIKE</option>
                <option value="ilike">ILIKE</option>
                <option value="null">IS NULL</option>
                <option value="not_null">NOT NULL</option>
              </select>
              <input
                type="text"
                class="form-control"
                placeholder="Filter value"
                id="table_filter_value"
                value={state.filterValue}
                style={{ display: ['null', 'not_null'].includes(state.filterOp) ? 'none' : 'block' }}
                onInput={(event) => setState('filterValue', event.currentTarget.value)}
              />
              <button class="btn btn-outline-success btn-sm apply-filters" type="submit">Apply</button>
              <button
                class="btn btn-outline-secondary btn-sm reset-filters"
                type="button"
                onClick={() => {
                  setState('filterColumn', '');
                  setState('filterOp', '');
                  setState('filterValue', '');
                  openTab('rows');
                }}
              >
                <i class="fa fa-times"></i>
              </button>
            </form>
            <div class="btn-group">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm prev-page"
                disabled={!state.result?.pagination || state.result.pagination.page <= 1}
                onClick={() => {
                  setState('page', Math.max(1, state.page - 1));
                  openTab('rows');
                }}
              >
                <i class="fa fa-angle-left"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm page change-limit"
                title="Click to change row limit"
                onClick={() => {
                  const limit = window.prompt('Please specify a new rows limit', String(state.rowsLimit));
                  const parsed = Number(limit);
                  if (limit && Number.isFinite(parsed) && parsed >= 1) {
                    setState('rowsLimit', parsed);
                    setState('page', 1);
                    openTab('rows');
                  }
                }}
              >
                {state.result?.pagination ? `${state.result.pagination.page} of ${state.result.pagination.pages_count || 1}` : '1 of 1'}
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm next-page"
                disabled={!state.result?.pagination || state.result.pagination.page >= state.result.pagination.pages_count}
                onClick={() => {
                  setState('page', state.page + 1);
                  openTab('rows');
                }}
              >
                <i class="fa fa-angle-right"></i>
              </button>
            </div>
            <div class="current-page" data-page={state.result?.pagination?.page ?? 1} data-pages={state.result?.pagination?.pages_count ?? 1}>
              <span id="total_records">{state.result?.pagination?.rows_count ?? 0}</span> rows
            </div>
          </div>
        </div>
      </div>

      <div id="content_modal" classList={{ hidden: !state.cellModal }}>
        <div class="title">
          Cell Content
          <div class="actions">
            <button class="btn btn-outline-secondary" onClick={() => setState('cellModal', null)}>
              <i class="fa fa-times"></i>
            </button>
            <button class="btn btn-outline-secondary" onClick={() => state.cellModal && copyToClipboard(state.cellModal)}>
              <i class="fa fa-copy"></i>
            </button>
          </div>
        </div>
        <pre class="content">{state.cellModal}</pre>
      </div>

      <ConnectionModal
        open={state.modalOpen}
        connecting={state.connecting}
        error={state.connectionError}
        mode={state.connectMode}
        form={state.connectForm}
        bookmarks={state.bookmarks}
        features={features()}
        canClose={connected()}
        onModeChange={updateMode}
        onFieldChange={updateForm}
        onClose={() => setState('modalOpen', !connected())}
        onSubmit={connect}
      />

      <div id="error_banner" style={{ display: state.bootError && !state.modalOpen ? 'block' : 'none' }}>{state.bootError}</div>

      <ContextMenu
        open={state.contextMenu.open}
        x={state.contextMenu.x}
        y={state.contextMenu.y}
        items={state.contextMenu.items}
        onClose={closeContextMenu}
      />
    </>
  );
}
