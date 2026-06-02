import { For, Show, onCleanup, onMount } from 'solid-js';

export type ContextMenuItem = {
  label: string;
  action: () => void | Promise<void>;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu(props: Props) {
  const close = () => props.onClose();

  onMount(() => {
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('click', close);
    window.removeEventListener('contextmenu', close);
    window.removeEventListener('keydown', onKeyDown);
  });

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      props.onClose();
    }
  }

  return (
    <Show when={props.open}>
      <div
        class="dropdown-menu show"
        style={{
          position: 'fixed',
          left: `${props.x}px`,
          top: `${props.y}px`,
          display: 'block',
          'z-index': '1100',
        }}
      >
        <For each={props.items}>
          {(item) =>
            item.divider ? (
              <div class="dropdown-divider"></div>
            ) : (
              <a
                href="#"
                classList={{ 'dropdown-item': true, disabled: item.disabled, 'text-danger': item.danger }}
                onClick={async (event) => {
                  event.preventDefault();
                  if (item.disabled) return;
                  await item.action();
                  props.onClose();
                }}
              >
                {item.label}
              </a>
            )
          }
        </For>
      </div>
    </Show>
  );
}
