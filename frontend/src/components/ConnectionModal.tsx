import { Show } from 'solid-js';
import type { FeatureFlags } from '../api/types';

export type ConnectionMode = 'scheme' | 'standard' | 'ssh';

export type ConnectionForm = {
  bookmarkId: string;
  url: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslMode: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshPassword: string;
  sshKey: string;
  sshKeyPassword: string;
};

type Props = {
  open: boolean;
  connecting: boolean;
  error: string | null;
  mode: ConnectionMode;
  form: ConnectionForm;
  bookmarks: string[];
  features: FeatureFlags;
  canClose: boolean;
  onModeChange: (mode: ConnectionMode) => void;
  onFieldChange: (field: keyof ConnectionForm, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function ConnectionModal(props: Props) {
  const manualDisabled = () => props.form.bookmarkId !== '';
  const bookmarksVisible = () => props.bookmarks.length > 0 || props.features.bookmarks_only;

  return (
    <div id="connection_window" classList={{ hidden: !props.open }}>
      <div class="connection-settings">
        <div class="header">
          <h1>pgweb</h1>
          <div class="version"></div>
          <div class="update alert alert-warning"></div>
        </div>

        <form
          role="form"
          class="form-horizontal"
          id="connection_form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit();
          }}
        >
          <div class="text-center">
            <div class="btn-group btn-group-sm connection-group-switch">
              <button
                type="button"
                class={`btn btn-outline-secondary ${props.mode === 'scheme' ? 'active' : ''}`}
                onClick={() => props.onModeChange('scheme')}
              >
                Scheme
              </button>
              <button
                type="button"
                class={`btn btn-outline-secondary ${props.mode === 'standard' ? 'active' : ''}`}
                onClick={() => props.onModeChange('standard')}
              >
                Standard
              </button>
              <button
                type="button"
                class={`btn btn-outline-secondary ${props.mode === 'ssh' ? 'active' : ''}`}
                onClick={() => props.onModeChange('ssh')}
              >
                SSH
              </button>
            </div>
          </div>

          <hr />

          <div classList={{ 'connection-scheme-group': true, hidden: props.mode !== 'scheme' || props.features.bookmarks_only }}>
            <div class="row">
              <div class="col-sm-12">
                <label class="form-label fw-bolder">Enter server URL scheme</label>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  value={props.form.url}
                  autocomplete="off"
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('url', event.currentTarget.value)}
                />
                <p class="form-text">
                  URL format: postgres://user:password@host:port/db?sslmode=mode
                  <br />
                  Read more on PostgreSQL{' '}
                  <a
                    href="https://www.postgresql.org/docs/current/static/libpq-connect.html#LIBPQ-CONNSTRING"
                    target="_blank"
                    rel="noreferrer"
                  >
                    connection string format
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>

          <div classList={{ 'connection-bookmarks-group': true, hidden: !bookmarksVisible() }}>
            <div class="row">
              <label class="col-sm-3 col-form-label">Bookmark</label>
              <div class="col-sm-9">
                <select
                  class="form-control form-control-sm"
                  value={props.form.bookmarkId}
                  onChange={(event) => props.onFieldChange('bookmarkId', event.currentTarget.value)}
                >
                  <option value="">Select bookmarked database</option>
                  {props.bookmarks.map((item) => (
                    <option value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div classList={{ 'connection-standard-group': true, hidden: props.features.bookmarks_only || props.mode === 'scheme' }}>
            <div class="row">
              <label class="col-sm-3 col-form-label">Host</label>
              <div class="col-sm-6">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  value={props.form.host}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('host', event.currentTarget.value)}
                />
              </div>
              <div class="col-sm-3 no-left-padding">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="5432"
                  value={props.form.port}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('port', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">Username</label>
              <div class="col-sm-9">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  value={props.form.user}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('user', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">Password</label>
              <div class="col-sm-9">
                <input
                  type="password"
                  class="form-control form-control-sm"
                  value={props.form.password}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('password', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">Database</label>
              <div class="col-sm-9">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  value={props.form.database}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('database', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">SSL Mode</label>
              <div class="col-sm-9">
                <select
                  class="form-select form-select-sm"
                  value={props.form.sslMode}
                  disabled={manualDisabled()}
                  onChange={(event) => props.onFieldChange('sslMode', event.currentTarget.value)}
                >
                  <option value="disable">disable</option>
                  <option value="require">require</option>
                  <option value="verify-full">verify-full</option>
                </select>
              </div>
            </div>
          </div>

          <div classList={{ 'connection-ssh-group': true, hidden: props.features.bookmarks_only || props.mode !== 'ssh' }}>
            <hr />
            <h3 class="text-center">SSH Connection</h3>

            <div class="row">
              <label class="col-sm-3 col-form-label">Host</label>
              <div class="col-sm-7">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  value={props.form.sshHost}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshHost', event.currentTarget.value)}
                />
              </div>
              <div class="col-sm-2 no-left-padding">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="22"
                  value={props.form.sshPort}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshPort', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">Credentials</label>
              <div class="col-sm-5">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Username"
                  value={props.form.sshUser}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshUser', event.currentTarget.value)}
                />
              </div>
              <div class="col-sm-4 no-left-padding">
                <input
                  type="password"
                  class="form-control form-control-sm"
                  placeholder="Password"
                  value={props.form.sshPassword}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshPassword', event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="row">
              <label class="col-sm-3 col-form-label">Auth Key</label>
              <div class="col-sm-5">
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Key path"
                  value={props.form.sshKey}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshKey', event.currentTarget.value)}
                />
              </div>
              <div class="col-sm-4 no-left-padding">
                <input
                  type="password"
                  class="form-control form-control-sm"
                  placeholder="Key password"
                  value={props.form.sshKeyPassword}
                  disabled={manualDisabled()}
                  onInput={(event) => props.onFieldChange('sshKeyPassword', event.currentTarget.value)}
                />
              </div>
            </div>

            <hr />
          </div>

          <div id="connection_error" classList={{ 'alert alert-danger': true, hidden: !props.error }}>
            {props.error}
          </div>

          <Show when={props.features.bookmarks_only && props.bookmarks.length === 0}>
            <div class="alert alert-danger">Running in bookmarks-only mode but no bookmarks configured.</div>
          </Show>

          <div class="row">
            <div class="col-sm-12 d-grid gap-2">
              <button
                type="submit"
                class="btn btn-primary open-connection"
                disabled={props.connecting || (props.features.bookmarks_only && props.bookmarks.length === 0)}
              >
                {props.connecting ? 'Please wait...' : 'Connect'}
              </button>
              <button
                type="button"
                id="close_connection_window"
                class="btn btn-outline-secondary"
                style={{ display: props.canClose ? 'block' : 'none' }}
                onClick={props.onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
