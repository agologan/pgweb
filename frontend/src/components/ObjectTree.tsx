import { For, Show, createMemo } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { DbObject, ObjectsResponse, SchemaObjects } from '../api/types';

export type SelectedObject = {
  id: string;
  name: string;
  schema: string;
  type: keyof SchemaObjects;
};

type Props = {
  schemas: string[];
  objects: ObjectsResponse;
  filter: string;
  selectedId: string | null;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  onSelect: (item: SelectedObject) => void;
  onItemContextMenu?: (event: MouseEvent, item: SelectedObject) => void;
};

const groupLabels: Record<keyof SchemaObjects, string> = {
  table: 'Tables',
  view: 'Views',
  materialized_view: 'Materialized Views',
  function: 'Functions',
  sequence: 'Sequences',
};

const groupIcons: Record<keyof SchemaObjects, string> = {
  table: 'fa-table',
  view: 'fa-table',
  materialized_view: 'fa-table',
  function: 'fa-bolt',
  sequence: 'fa-circle-o',
};

function emptyGroup(): SchemaObjects {
  return {
    table: [],
    view: [],
    materialized_view: [],
    function: [],
    sequence: [],
  };
}

export function ObjectTree(props: Props) {
  const [expandedSchemas, setExpandedSchemas] = createStore<Record<string, boolean>>({ public: true });
  const [expandedGroups, setExpandedGroups] = createStore<Record<string, boolean>>({ 'public:table': true });

  const normalized = createMemo(() => {
    const query = props.filter.trim().toLowerCase();
    const names = new Set<string>([...props.schemas, ...Object.keys(props.objects)]);

    return [...names]
      .sort((left, right) => left.localeCompare(right))
      .map((schema) => {
        const groups = props.objects[schema] ?? emptyGroup();
        const filtered = Object.fromEntries(
          (Object.keys(groups) as Array<keyof SchemaObjects>).map((key) => [
            key,
            groups[key].filter((item) => item.name.toLowerCase().includes(query)),
          ]),
        ) as SchemaObjects;

        const total = Object.values(filtered).reduce((count, items) => count + items.length, 0);
        return { schema, groups: filtered, total };
      })
      .filter((entry) => query === '' || entry.total > 0);
  });

  const selectObject = (schema: string, type: keyof SchemaObjects, item: DbObject) => {
    props.onSelect({
      id: type === 'function' ? item.oid : `${schema}.${item.name}`,
      name: item.name,
      schema,
      type,
    });
  };

  const toggleSchema = (schema: string) => setExpandedSchemas(schema, !expandedSchemas[schema]);
  const toggleGroup = (schema: string, group: keyof SchemaObjects) => {
    const key = `${schema}:${group}`;
    setExpandedGroups(key, !expandedGroups[key]);
  };

  return (
    <div id="objects">
      <Show when={normalized().length > 0} fallback={<div class="p-2 text-muted">No database objects</div>}>
        <For each={normalized()}>
          {(schemaEntry) => (
            <div classList={{ schema: true, expanded: expandedSchemas[schemaEntry.schema] ?? schemaEntry.schema === 'public' }}>
              <div class="schema-name" onClick={() => toggleSchema(schemaEntry.schema)}>
                <i class="fa fa-folder-o"></i>
                <i class="fa fa-folder-open-o"></i>
                {schemaEntry.schema}
              </div>

              <div class="schema-container">
                <For each={Object.keys(schemaEntry.groups) as Array<keyof SchemaObjects>}>
                  {(groupName) => (
                    <Show when={schemaEntry.groups[groupName].length > 0}>
                      <div
                        classList={{
                          'schema-group': true,
                          expanded:
                            expandedGroups[`${schemaEntry.schema}:${groupName}`] ??
                            (schemaEntry.schema === 'public' && groupName === 'table'),
                        }}
                      >
                        <div class="schema-group-title" onClick={() => toggleGroup(schemaEntry.schema, groupName)}>
                          <i class="fa fa-chevron-right"></i>
                          <i class="fa fa-chevron-down"></i>
                          {groupLabels[groupName]}
                          <span class="schema-group-count">{schemaEntry.groups[groupName].length}</span>
                        </div>
                        <ul data-group={groupName}>
                          <For each={schemaEntry.groups[groupName]}>
                            {(item) => {
                              const itemId = groupName === 'function' ? item.oid : `${schemaEntry.schema}.${item.name}`;
                              return (
                                <li
                                  classList={{
                                    'schema-item': true,
                                    [`schema-${groupName}`]: true,
                                    active: props.selectedId === itemId,
                                  }}
                                  data-type={groupName}
                                  data-id={itemId}
                                  data-name={item.name}
                                  onClick={() => selectObject(schemaEntry.schema, groupName, item)}
                                  onContextMenu={(event) =>
                                    props.onItemContextMenu?.(event, {
                                      id: itemId,
                                      name: item.name,
                                      schema: schemaEntry.schema,
                                      type: groupName,
                                    })
                                  }
                                >
                                  <i class={`fa ${groupIcons[groupName]}`}></i>&nbsp;{item.name}
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
