import type { Print } from '@parshjs/core';

const MS_PER_SECOND = 1000;
const HTTP_OK = 200;
const HTTP_REDIRECT = 300;
const HTTP_CLIENT_ERROR = 400;
const JSON_INDENT = 2;

type RunRequest = {
  method: string;
  url: string;
  headers: readonly string[];
  query: readonly string[];
  data: string | undefined;
  auth: string | undefined;
  timeout: number;
  follow: boolean | undefined;
  verbose: boolean | undefined;
  print: Print;
};

export async function runRequest(req: RunRequest): Promise<void> {
  const target = new URL(req.url);
  for (const entry of req.query) {
    const eq = entry.indexOf('=');
    if (eq > 0) {
      target.searchParams.append(entry.slice(0, eq), entry.slice(eq + 1));
    }
  }

  const headers = new Headers();
  for (const entry of req.headers) {
    const colon = entry.indexOf(':');
    if (colon > 0) {
      headers.append(entry.slice(0, colon).trim(), entry.slice(colon + 1).trim());
    }
  }
  if (req.auth) {
    headers.set('Authorization', `Basic ${btoa(req.auth)}`);
  }
  if (req.data !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (req.verbose) {
    req.print.dim(`> ${req.method} ${target}`);
    for (const [k, v] of headers) {
      req.print.dim(`> ${k}: ${v}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeout * MS_PER_SECOND);
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: req.data,
      redirect: req.follow ? 'follow' : 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const statusLine = `HTTP ${res.status} ${res.statusText}`;
  if (res.status >= HTTP_OK && res.status < HTTP_REDIRECT) {
    req.print.success(statusLine);
  } else if (res.status >= HTTP_CLIENT_ERROR) {
    req.print.error(statusLine);
  } else {
    req.print.info(statusLine);
  }

  if (req.verbose) {
    for (const [k, v] of res.headers) {
      req.print.dim(`< ${k}: ${v}`);
    }
  }

  const body = await res.text();
  if (!body) {
    return;
  }
  const isJson = res.headers.get('content-type')?.includes('json') ?? false;
  if (isJson) {
    try {
      req.print.info(JSON.stringify(JSON.parse(body), null, JSON_INDENT));
      return;
    } catch {
      // fall through to raw print
    }
  }
  req.print.info(body);
}
