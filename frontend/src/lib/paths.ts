function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export function getBasePath(): string {
  const { pathname } = window.location;
  const staticIndex = pathname.indexOf('/static/');

  if (staticIndex >= 0) {
    const prefix = pathname.slice(0, staticIndex);
    return prefix.length > 0 ? `${prefix}/` : '/';
  }

  if (pathname === '/' || pathname.endsWith('/')) {
    return pathname;
  }

  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash === 0) {
    return `${pathname}/`;
  }

  return pathname.slice(0, lastSlash + 1);
}

export function buildApiUrl(path: string): string {
  const basePath = getBasePath();
  const apiPath = trimSlashes(`api/${trimSlashes(path)}`);
  return new URL(`${trimSlashes(basePath)}/${apiPath}`, window.location.origin + '/').toString();
}

export function buildAppUrl(path: string): string {
  const basePath = getBasePath();
  const appPath = trimSlashes(path);
  return new URL(`${trimSlashes(basePath)}/${appPath}`, window.location.origin + '/').toString();
}
