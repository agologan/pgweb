const SESSION_KEY = 'session_id';

function guid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getSessionId(): string {
  let id = window.sessionStorage.getItem(SESSION_KEY);

  if (!id) {
    id = guid();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }

  return id;
}

export function bootstrapSessionFromUrl(): void {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get('session');

  if (!sessionId) {
    return;
  }

  window.sessionStorage.setItem(SESSION_KEY, sessionId);
  url.searchParams.delete('session');
  window.history.replaceState({}, document.title, url.toString());
}
