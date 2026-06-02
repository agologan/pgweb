import { render } from 'solid-js/web';
import App from './app';
import { bootstrapSessionFromUrl } from './lib/session';
import './styles/app.css';

bootstrapSessionFromUrl();

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

render(() => <App />, root);
