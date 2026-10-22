import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
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
        return DecorationSet.create(doc, codeDecorations(doc, 0, doc.content.size));
      },
      apply(tr, oldSet) {
        if (!tr.docChanged) return oldSet;
        return updateDecorations(tr, oldSet);
      },
    },
    props: {
      decorations(state) {
        return highlightKey.getState(state);
      },
    },
  });
}

/**
 * A code block whose tokens changed more than this is redecorated whole:
 * DecorationSet.remove compares each decoration it removes with every
 * other one in the block, which gets slow for many.
 */
const MAX_TOKENS_REPLACED = 100;

/** The same token: same place, same classes (`spec.token`, see tokenDecorations). */
const sameToken = (a: Decoration, b: Decoration) =>
  a.from === b.from && a.to === b.to && a.spec['token'] === b.spec['token'];
const byPosition = (a: Decoration, b: Decoration) => a.from - b.from || a.to - b.to;

/**
 * The decorations after an edit. Those of code blocks it left alone move
 * with the text (mapped), so typing outside code costs no tokenizing. A
 * code block it changed is tokenized again, and only the tokens that came
 * out different are replaced: usually one or two per keystroke.
 */
function updateDecorations(tr: Transaction, set: DecorationSet): DecorationSet {
  const doc = tr.doc;
  let mapped = set.map(tr.mapping, doc);
  // The changed part of the document; attribute changes (a code block's
  // language) count, though they move no text.
  const start = doc.content.findDiffStart(tr.before.content);
  if (start == null) return mapped;
  const end = doc.content.findDiffEnd(tr.before.content);
  // With repeated text, the end can be found before the start.
  let from = start;
  let to = Math.max(end?.a ?? start, start);
  // Whole code blocks: a change anywhere in one tokenizes all of it again.
  const blocks: { node: PMNode; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return true;
    blocks.push({ node, pos });
    from = Math.min(from, pos);
    to = Math.max(to, pos + node.nodeSize);
    return false;
  });
  if (from === to) return mapped;

  // Ranges to clear of every token: mapped through a replace of a range,
  // an inline decoration strictly inside it goes. Code blocks begin and end
  // the ranges, so all the tokens in them are strictly inside.
  const clear: number[] = [];
  const clearRange = (a: number, b: number) => {
    if (b > a) clear.push(a, b - a, b - a);
  };
  const removed: Decoration[] = [];
  const added: Decoration[] = [];
  let gapStart = from;
  for (const { node, pos } of blocks) {
    // Between code blocks, tokens are left over: a code block became a paragraph.
    clearRange(gapStart, pos);
    gapStart = pos + node.nodeSize;

    const fresh: Decoration[] = [];
    tokenDecorations(node, pos, fresh);
    const old = mapped.find(pos, pos + node.nodeSize).sort(byPosition);
    let same = 0;
    while (same < old.length && same < fresh.length && sameToken(old[same], fresh[same])) same++;
    let oldEnd = old.length;
    let freshEnd = fresh.length;
    while (oldEnd > same && freshEnd > same && sameToken(old[oldEnd - 1], fresh[freshEnd - 1])) {
      oldEnd--;
      freshEnd--;
    }
    if (oldEnd - same > MAX_TOKENS_REPLACED) {
      clearRange(pos, pos + node.nodeSize);
      added.push(...fresh);
    } else {
      removed.push(...old.slice(same, oldEnd));
      added.push(...fresh.slice(same, freshEnd));
    }
  }
  clearRange(gapStart, to);

  if (clear.length) mapped = mapped.map(new Mapping([new StepMap(clear)]), doc);
  return mapped.remove(removed).add(doc, added);
}

/** The token decorations of the code blocks between `from` and `to`. */
function codeDecorations(doc: PMNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return true;
    tokenDecorations(node, pos, decorations);
    return false;
  });
  return decorations;
}

/** Adds the token decorations of the code block at `pos` to `decorations`. */
function tokenDecorations(node: PMNode, pos: number, decorations: Decoration[]): void {
  const text = node.textContent;
  if (!text) return;

  const lang = node.attrs['language'] || 'typescript';
  const grammar = getGrammar(lang);
  if (!grammar) return;

  const tokens = Prism.tokenize(text, grammar);
  let offset = 0;

  // The classes go in the spec too, to compare tokens (see updateDecorations).
  const push = (length: number, type: string) => {
    const from = pos + 1 + offset;
    const token = `token ${type}`;
    decorations.push(Decoration.inline(from, from + length, { class: token }, { token }));
  };

  function walk(tokenList: (string | Prism.Token)[], parentType?: string) {
    for (const token of tokenList) {
      if (typeof token === 'string') {
        if (parentType) push(token.length, parentType);
        offset += token.length;
      } else {
        const tokenType = parentType ? `${parentType} ${token.type}` : token.type;
        if (typeof token.content === 'string') {
          push(token.length, tokenType);
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
}
