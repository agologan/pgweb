import { For, Match, Show, Switch, createSignal } from 'solid-js';
import type { ResultSet } from '../api/types';

type Props = {
  result: ResultSet | null;
  mode?: 'browse' | 'query';
  sortColumn?: string | null;
  sortOrder?: 'ASC' | 'DESC' | null;
  rowAction?: {
    label: string;
    column: string;
    variant?: 'danger' | 'primary';
    onClick: (value: string) => void;
  };
  onSort?: (column: string, nextOrder: 'ASC' | 'DESC') => void;
  onCellOpen?: (value: string) => void;
  onHeaderContextMenu?: (event: MouseEvent, column: string) => void;
  onCellContextMenu?: (event: MouseEvent, value: string, columnIndex: number) => void;
};

export function ResultTable(props: Props) {
  const [activeRow, setActiveRow] = createSignal<number | null>(null);

  return (
    <table
      id="results"
      classList={{
        table: true,
        'table-striped': true,
        'table-hover': true,
        'table-borderless': true,
        empty: Boolean(props.result && !props.result.error && props.result.rows.length === 0),
        'no-crop': false,
      }}
      data-mode={props.mode ?? 'browse'}
    >
      <thead id="results_header">
        <Switch>
          <Match when={props.result && !props.result.error && props.result.columns.length > 0}>
            <tr>
              <For each={props.result?.columns ?? []}>
                {(column) => {
                  const active = () => props.sortColumn === column;
                  const direction = () => (active() ? props.sortOrder : null);
                  return (
                    <th
                      classList={{ active: active() }}
                      data-name={column}
                      data-order={direction() ?? undefined}
                      onContextMenu={(event) => props.onHeaderContextMenu?.(event, column)}
                    >
                      <button
                        type="button"
                        class="table-header-button"
                        onClick={() => props.onSort?.(column, active() && props.sortOrder === 'ASC' ? 'DESC' : 'ASC')}
                      >
                        <span>{column}</span>
                        <small>{direction() === 'ASC' ? '▲' : direction() === 'DESC' ? '▼' : ''}</small>
                      </button>
                    </th>
                  );
                }}
              </For>
              <Show when={props.rowAction}>
                <th></th>
              </Show>
            </tr>
          </Match>
        </Switch>
      </thead>
      <tbody id="results_body">
        <Switch>
          <Match when={props.result?.error}>
            <tr>
              <td colspan={Math.max((props.result?.columns.length ?? 0) + (props.rowAction ? 1 : 0), 1)}>
                ERROR: {props.result?.error}
              </td>
            </tr>
          </Match>
          <Match when={props.result && props.result.rows.length === 0}>
            <tr>
              <td colspan={Math.max((props.result?.columns.length ?? 0) + (props.rowAction ? 1 : 0), 1)}>No records found</td>
            </tr>
          </Match>
          <Match when={props.result}>
            <For each={props.result?.rows ?? []}>
              {(row, rowIndex) => (
                <tr classList={{ 'table-active': activeRow() === rowIndex() }} onClick={() => setActiveRow(rowIndex())}>
                  <For each={row}>
                    {(value, colIndex) => (
                      <td
                        data-col={colIndex()}
                        onContextMenu={(event) => props.onCellContextMenu?.(event, value == null ? 'null' : String(value), colIndex())}
                      >
                        <button type="button" class="cell-button" onDblClick={() => props.onCellOpen?.(value == null ? 'null' : String(value))}>
                          <div>
                            <Show when={value != null} fallback={<span class="null">null</span>}>
                              {String(value)}
                            </Show>
                          </div>
                        </button>
                      </td>
                    )}
                  </For>
                  <Show when={props.rowAction}>
                    {(action) => {
                      const columnIndex = props.result?.columns.indexOf(action().column) ?? -1;
                      const value = columnIndex >= 0 ? row[columnIndex] : null;
                      return (
                        <td>
                          <a
                            href="#"
                            class={`btn btn-sm btn-${action().variant === 'danger' ? 'danger' : 'primary'} row-action`}
                            onClick={(event) => {
                              event.preventDefault();
                              action().onClick(String(value ?? ''));
                            }}
                          >
                            {action().label}
                          </a>
                        </td>
                      );
                    }}
                  </Show>
                </tr>
              )}
            </For>
          </Match>
        </Switch>
      </tbody>
    </table>
  );
}
