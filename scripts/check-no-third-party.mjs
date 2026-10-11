#!/usr/bin/env node
/**
 * Fails if the built app would load anything from a third-party origin
 * (fonts, scripts, stylesheets, images in CSS). Inkframe promises that
 * nothing leaves the device, so every asset must be self-hosted.
 *
 * Usage: node scripts/check-no-third-party.mjs [dist/inkframe-app/browser]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? 'dist/inkframe-app/browser';

// Resource-loading references only; plain <a href> links to other sites are fine.
const PATTERNS = [
  { re: /<link\b[^>]*\bhref=["']?(?:https?:)?\/\/[^"'\s>]+/gi, what: '<link href>' },
  { re: /<script\b[^>]*\bsrc=["']?(?:https?:)?\/\/[^"'\s>]+/gi, what: '<script src>' },
  { re: /<img\b[^>]*\bsrc=["']?(?:https?:)?\/\/[^"'\s>]+/gi, what: '<img src>' },
  { re: /url\(\s*["']?(?:https?:)?\/\/[^)"']+/gi, what: 'CSS url()' },
  { re: /@import\s+(?:url\()?\s*["']?(?:https?:)?\/\/[^)"';]+/gi, what: 'CSS @import' },
];

const files = [];
const walk = (d) => {
  for (const entry of readdirSync(d)) {
    const path = join(d, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(html|css)$/.test(entry)) files.push(path);
  }
};
walk(dir);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const { re, what } of PATTERNS) {
    for (const m of text.matchAll(re)) problems.push(`${relative(dir, file)}: ${what}: ${m[0].slice(0, 120)}`);
  }
}

if (problems.length) {
  console.error(`Third-party resources found in the build:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`No third-party resources in ${files.length} HTML/CSS files.`);
