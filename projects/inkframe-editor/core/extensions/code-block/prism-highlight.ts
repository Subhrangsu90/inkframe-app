/*
 * Syntax highlighting with Prism alone, for HTML (exports, the reader) and
 * for the editor's highlight plugin. Kept apart from that plugin so pages
 * that only show documents don't load the editor's view code.
 */
import Prism from 'prismjs';

import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';

const ALIAS_MAP: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  cs: 'csharp',
  md: 'markdown',
  plain: 'plain',
  plaintext: 'plain',
};

export function getGrammar(lang: string): Prism.Grammar | undefined {
  const norm = (lang || 'typescript').toLowerCase();
  const target = ALIAS_MAP[norm] || norm;
  return Prism.languages[target] || Prism.languages['typescript'] || Prism.languages['javascript'];
}

/**
 * Highlights code inside all <pre><code> or <pre class="ink-code-block"> elements in an HTML string.
 */
export function highlightCodeInHtml(html: string): string {
  if (!html) return '';

  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = html;
    const codeBlocks = div.querySelectorAll('pre code, pre.ink-code-block code');
    if (codeBlocks.length === 0) {
      const preBlocks = div.querySelectorAll('pre.ink-code-block, pre[class*="language-"]');
      preBlocks.forEach((pre) => {
        const lang =
          pre.getAttribute('data-language') ||
          pre.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
          'typescript';
        const grammar = getGrammar(lang);
        const text = pre.textContent || '';
        if (grammar && text) {
          pre.innerHTML = `<code class="language-${lang}">${Prism.highlight(text, grammar, lang)}</code>`;
        }
      });
      return div.innerHTML;
    }

    codeBlocks.forEach((codeEl) => {
      const pre = codeEl.closest('pre');
      const lang =
        pre?.getAttribute('data-language') ||
        codeEl.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
        pre?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
        'typescript';
      const grammar = getGrammar(lang);
      const text = codeEl.textContent || '';
      if (grammar && text) {
        codeEl.innerHTML = Prism.highlight(text, grammar, lang);
      }
    });
    return div.innerHTML;
  }

  // SSR fallback
  return html.replace(
    /(<pre[^>]*?(?:data-language=["']([^"']+)["']|class=["'][^"']*language-([a-z0-9_-]+)[^"']*["'])?[^>]*>\s*<code[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
    (match, openTag, langAttr, langClass, codeContent, closeTag) => {
      const lang = langAttr || langClass || 'typescript';
      const grammar = getGrammar(lang);
      if (grammar) {
        const decoded = codeContent
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        return `${openTag}${Prism.highlight(decoded, grammar, lang)}${closeTag}`;
      }
      return match;
    },
  );
}

/**
 * Highlights all code blocks within a given DOM container.
 */
export function highlightPreviewElement(container: HTMLElement): void {
  if (!container || typeof document === 'undefined') return;
  const codeBlocks = container.querySelectorAll('pre code, pre.ink-code-block code');
  codeBlocks.forEach((codeEl) => {
    const pre = codeEl.closest('pre');
    const lang =
      pre?.getAttribute('data-language') ||
      codeEl.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
      pre?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
      'typescript';
    const grammar = getGrammar(lang);
    const text = codeEl.textContent || '';
    if (grammar && text) {
      codeEl.innerHTML = Prism.highlight(text, grammar, lang);
    }
  });
}
