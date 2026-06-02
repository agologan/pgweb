import { buildApiUrl } from '../lib/paths';
import { getSessionId } from '../lib/session';
import type {
  ConnectionInfo,
  HistoryRecord,
  InfoResponse,
  LocalQuery,
  ObjectsResponse,
  ResultSet,
  TableInfo,
} from './types';

type RequestOptions = {
  method?: 'GET' | 'POST';
  params?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

function toSearchParams(params: RequestOptions['params']): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (!params) {
    return searchParams;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  return searchParams;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function sanitizeBase64(value: string): string {
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

function parsePayload(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 300_000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = toSearchParams(options.params);
    const url = new URL(buildApiUrl(path));

    const init: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        'x-session-id': getSessionId(),
      },
    };

    if (method === 'GET') {
      params.forEach((value, key) => {
        url.searchParams.set(key, value);
      });
    } else {
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      };
      init.body = params.toString();
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const payload = parsePayload(text) as T;

    if (!response.ok) {
      throw payload;
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw { error: `Request timeout after ${Math.floor(timeoutMs / 1000)}s` };
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  getInfo() {
    return request<InfoResponse>('/info');
  },
  getConnection() {
    return request<ConnectionInfo>('/connection');
  },
  getBookmarks() {
    return request<string[]>('/bookmarks');
  },
  getSchemas() {
    return request<string[]>('/schemas');
  },
  getObjects() {
    return request<ObjectsResponse>('/objects');
  },
  getTableInfo(table: string) {
    return request<TableInfo>(`/tables/${encodePathSegment(table)}/info`);
  },
  getTableRows(table: string, params: Record<string, string | number | boolean | null | undefined>) {
    return request<ResultSet>(`/tables/${encodePathSegment(table)}/rows`, { params });
  },
  getTableStructure(table: string, type?: string) {
    return request<ResultSet>(`/tables/${encodePathSegment(table)}`, { params: { type } });
  },
  getTableIndexes(table: string) {
    return request<ResultSet>(`/tables/${encodePathSegment(table)}/indexes`);
  },
  getTableConstraints(table: string) {
    return request<ResultSet>(`/tables/${encodePathSegment(table)}/constraints`);
  },
  getHistory() {
    return request<HistoryRecord[]>('/history');
  },
  getActivity() {
    return request<ResultSet>('/activity');
  },
  getServerSettings() {
    return request<ResultSet>('/server_settings');
  },
  getTablesStats() {
    return request<ResultSet>('/tables_stats');
  },
  getDatabases() {
    return request<string[]>('/databases');
  },
  switchDatabase(db: string) {
    return request<ConnectionInfo>('/switchdb', { method: 'POST', params: { db } });
  },
  getLocalQueries() {
    return request<LocalQuery[]>('/local_queries');
  },
  getLocalQuery(id: string) {
    return request<LocalQuery>(`/local_queries/${encodePathSegment(id)}`);
  },
  runQuery(query: string) {
    return request<ResultSet>('/query', { method: 'POST', params: { query } });
  },
  explainQuery(query: string) {
    return request<ResultSet>('/explain', { method: 'POST', params: { query } });
  },
  analyzeQuery(query: string) {
    return request<ResultSet>('/analyze', { method: 'POST', params: { query } });
  },
  connect(params: Record<string, string | number | boolean | null | undefined>) {
    return request<ConnectionInfo>('/connect', { method: 'POST', params });
  },
  disconnect() {
    return request<{ success: boolean }>('/disconnect', { method: 'POST' });
  },
  buildQueryExportUrl(format: 'csv' | 'json' | 'xml', query: string) {
    const url = new URL(buildApiUrl('/query'));
    url.searchParams.set('format', format);
    url.searchParams.set('query', sanitizeBase64(query));
    url.searchParams.set('_session_id', getSessionId());
    return url.toString();
  },
  buildTableExportUrl(format: 'csv' | 'json' | 'xml', table: string, database: string) {
    const url = new URL(buildApiUrl('/query'));
    url.searchParams.set('format', format);
    url.searchParams.set('filename', `${database}.${table}.${format}`);
    url.searchParams.set('query', `SELECT * FROM ${table}`);
    url.searchParams.set('_session_id', getSessionId());
    return url.toString();
  },
  buildDumpUrl(table?: string) {
    const url = new URL(buildApiUrl('/export'));
    if (table) {
      url.searchParams.set('table', table);
    }
    url.searchParams.set('_session_id', getSessionId());
    return url.toString();
  },
  buildDatabaseStatsExportUrl() {
    const url = new URL(buildApiUrl('/tables_stats'));
    url.searchParams.set('format', 'csv');
    url.searchParams.set('export', 'true');
    url.searchParams.set('_session_id', getSessionId());
    return url.toString();
  },
};
