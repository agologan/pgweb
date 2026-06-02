export type ApiError = {
  error: string;
};

export type AppInfo = {
  version: string;
  [key: string]: unknown;
};

export type FeatureFlags = {
  session_lock: boolean;
  query_timeout: number | null;
  local_queries: boolean;
  bookmarks_only: boolean;
};

export type InfoResponse = {
  app: AppInfo;
  features: FeatureFlags;
};

export type ConnectionInfo = {
  current_database?: string;
  current_user?: string;
  current_host?: string;
  current_port?: number | string;
  session_lock?: boolean;
  [key: string]: unknown;
};

export type DbObject = {
  oid: string;
  name: string;
};

export type SchemaObjects = {
  table: DbObject[];
  view: DbObject[];
  materialized_view: DbObject[];
  function: DbObject[];
  sequence: DbObject[];
};

export type ObjectsResponse = Record<string, SchemaObjects>;

export type TableInfo = {
  total_size?: string;
  data_size?: string;
  index_size?: string;
  rows_count?: string | number;
  [key: string]: unknown;
};

export type Pagination = {
  rows_count: number;
  page: number;
  pages_count: number;
  per_page: number;
};

export type ResultStats = {
  columns_count: number;
  rows_count: number;
  rows_affected: number;
  query_start_time: string;
  query_finish_time: string;
  query_duration_ms: number;
};

export type ResultSet = {
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
  pagination?: Pagination;
  stats?: ResultStats;
  error?: string;
};

export type HistoryRecord = {
  query: string;
  timestamp: string;
};

export type LocalQuery = {
  id: string;
  title?: string;
  description?: string;
  query: string;
};
