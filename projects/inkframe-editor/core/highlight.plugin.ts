import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import Prism from 'prismjs';

import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';

export const highlightKey = new PluginKey('syntax-highlight');

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

export function highlightPlugin(): Plugin {
  return new Plugin({
    key: highlightKey,
    state: {
      init(_, { doc }) {
        return buildDecorations(doc);
      },
      apply(tr, oldSet) {
        if (!tr.docChanged) return oldSet;
        return buildDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return highlightKey.getState(state);
      },
    },
  });
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      const text = node.textContent;
      if (!text) return false;

      const lang = node.attrs['language'] || 'typescript';
      const grammar = getGrammar(lang);
      if (!grammar) return false;

      const tokens = Prism.tokenize(text, grammar);
      let offset = 0;

      function walk(tokenList: Array<string | Prism.Token>, parentType?: string) {
        for (const token of tokenList) {
          if (typeof token === 'string') {
            if (parentType) {
              const from = pos + 1 + offset;
              const to = from + token.length;
              decorations.push(
                Decoration.inline(from, to, {
                  class: `token ${parentType}`,
                }),
              );
            }
            offset += token.length;
          } else {
            const tokenType = parentType ? `${parentType} ${token.type}` : token.type;
            if (typeof token.content === 'string') {
              const from = pos + 1 + offset;
              const to = from + token.length;
              decorations.push(
                Decoration.inline(from, to, {
                  class: `token ${tokenType}`,
                }),
              );
              offset += token.length;
            } else if (Array.isArray(token.content)) {
              walk(token.content, tokenType);
            } else if (token.content instanceof Prism.Token) {
              walk([token.content], tokenType);
            } else {
              offset += token.length;
            }
          }
        }
      }

      walk(tokens);
      return false;
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}
