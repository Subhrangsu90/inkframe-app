#!/usr/bin/env node
/**
 * Adds a Content-Security-Policy <meta> to every built HTML page, allowing
 * exactly the inline scripts that page has, by hash: Angular's event-replay
 * contract and bootstrap call (prerendered pages) and the critical-CSS loader.
 * Angular's own `security.autoCsp` does this for index.html only and can't be
 * used with prerendering. Every page is a static file, so the hashes are
 * known at build time and the pages can be cached for everyone.
 *
 * Rules a <meta> can't carry (frame-ancestors) and the other security
 * headers are in vercel.json. When a page changes, its hash in the service
 * worker's ngsw.json is updated too, or installed apps would refuse the update.
 *
 * Usage: node scripts/add-csp.mjs [dist/inkframe-app/browser]
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dir = process.argv[2] ?? 'dist/inkframe-app/browser';

const policy = (scriptHashes) =>
  [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(' ')}`.trim(),
    // Angular adds <style> elements at runtime, and documents use style attributes.
    "style-src 'self' 'unsafe-inline'",
    // Documents may show images from any https address; stored ones are blob: and data: URLs.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // The API is on this origin (vercel.json forwards it); images are read back from blob: and data: URLs.
    "connect-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

const META = /<meta http-equiv="Content-Security-Policy"[^>]*>/i;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// An attribute like onload= or onclick= inside a tag: the policy blocks those.
const INLINE_HANDLER = /<[a-z][^>]*\son[a-z]+\s*=/gi;

const isExecutable = (attrs) => {
  if (/\bsrc\s*=/i.test(attrs)) return false;
  const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
  return (
    !type || type === 'module' || type === 'text/javascript' || type === 'application/javascript'
  );
};

const sha = (algorithm, text, encoding) =>
  createHash(algorithm).update(text, 'utf8').digest(encoding);

const pages = [];
const walk = (d) => {
  for (const entry of readdirSync(d)) {
    const path = join(d, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith('.html')) pages.push(path);
  }
};
walk(dir);

const ngswPath = join(dir, 'ngsw.json');
let ngsw = null;
try {
  ngsw = JSON.parse(readFileSync(ngswPath, 'utf8'));
} catch {
  // No service worker in this build (development).
}

const problems = [];
const allHashes = new Set();
for (const page of pages) {
  const name = relative(dir, page).split(sep).join('/');
  const html = readFileSync(page, 'utf8').replace(META, '');

  for (const m of html.matchAll(INLINE_HANDLER))
    problems.push(`${name}: inline event handler: ${m[0].slice(0, 120)}`);

  const hashes = [...html.matchAll(SCRIPT)]
    .filter(([, attrs]) => isExecutable(attrs))
    .map(([, , body]) => `sha256-${sha('sha256', body, 'base64')}`);
  const unique = [...new Set(hashes)];
  unique.forEach((h) => allHashes.add(h));

  if (!/<head\b[^>]*>/i.test(html)) {
    problems.push(`${name}: no <head> to put the policy in`);
    continue;
  }
  // First in <head>, so it applies before any script is parsed.
  const out = html.replace(
    /<head\b[^>]*>/i,
    (head) => `${head}<meta http-equiv="Content-Security-Policy" content="${policy(unique)}">`,
  );
  writeFileSync(page, out);

  if (ngsw?.hashTable?.[`/${name}`] !== undefined)
    ngsw.hashTable[`/${name}`] = sha('sha1', out, 'hex');
}

if (problems.length) {
  console.error(`Content Security Policy problems in the build:\n${problems.join('\n')}`);
  process.exit(1);
}
if (ngsw) writeFileSync(ngswPath, JSON.stringify(ngsw, null, 2));
console.log(
  `Content Security Policy added to ${pages.length} pages (${allHashes.size} distinct inline scripts).`,
);
