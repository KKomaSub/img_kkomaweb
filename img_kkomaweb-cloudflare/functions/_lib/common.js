export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-Original-Name, X-File-Kind, X-Original-Mime",
  "Access-Control-Max-Age": "86400"
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function text(message, status = 200, headers = {}) {
  return new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function noContent(status = 204) {
  return new Response(null, { status, headers: CORS_HEADERS });
}

export function decodeBase64Utf8(value = "") {
  if (!value) return "";
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function cleanFilename(name, fallback = "upload.png") {
  const raw = String(name || fallback).replace(/[\\/\0\r\n]/g, "_").trim();
  return raw || fallback;
}

export function contentDisposition(type, filename) {
  const clean = cleanFilename(filename);
  const encoded = encodeURIComponent(clean).replace(/['()]/g, escape);
  return `${type}; filename="${clean.replace(/"/g, "'")}"; filename*=UTF-8''${encoded}`;
}
