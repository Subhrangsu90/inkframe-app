import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';

export const CODE_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'plaintext', label: 'Plain Text' },
];

export class CodeBlockNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly gutter: HTMLElement;
  private readonly pre: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly langBtn: HTMLButtonElement;
  private readonly langLabel: HTMLSpanElement;
  private readonly langMenu: HTMLElement;
  private readonly wrapBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;

  private isDestroyed = false;
  private isMenuOpen = false;
  private lineCount = 1;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    // 1. Root container
    this.dom = document.createElement('div');
    this.dom.className = 'ink-code-block-wrapper';

    // 2. Main editor body (gutter + pre)
    const body = document.createElement('div');
    body.className = 'ink-code-body';

    // 3. Line numbers gutter
    this.gutter = document.createElement('div');
    this.gutter.className = 'ink-code-gutter';
    this.gutter.setAttribute('aria-hidden', 'true');

    // 4. Pre and code contentDOM
    this.pre = document.createElement('pre');
    this.pre.className = 'ink-code-pre';

    this.contentDOM = document.createElement('code');
    this.contentDOM.className = 'ink-code-content';
    this.contentDOM.spellcheck = false;

    this.pre.appendChild(this.contentDOM);
    body.appendChild(this.gutter);
    body.appendChild(this.pre);
    this.dom.appendChild(body);

    // 5. Floating control bar (matches Screenshot6.png)
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'ink-code-toolbar';

    // 5a. Language selector button
    this.langBtn = document.createElement('button');
    this.langBtn.type = 'button';
    this.langBtn.className = 'ink-code-lang-btn';

    this.langLabel = document.createElement('span');
    this.langLabel.className = 'ink-lang-text';
    this.langLabel.textContent = this.getLanguageLabel(node.attrs['language']);

    const caret = document.createElement('span');
    caret.className = 'ink-lang-caret';
    caret.textContent = '▾';

    this.langBtn.appendChild(this.langLabel);
    this.langBtn.appendChild(caret);

    // 5b. Language dropdown menu
    this.langMenu = document.createElement('div');
    this.langMenu.className = 'ink-code-lang-menu';
    this.langMenu.style.display = 'none';
    this.populateLanguageMenu();

    this.langBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleLanguageMenu();
    });

    // 5c. Word wrap toggle button (⇄)
    this.wrapBtn = document.createElement('button');
    this.wrapBtn.type = 'button';
    this.wrapBtn.className = 'ink-code-tool-btn wrap-btn';
    this.wrapBtn.title = 'Toggle word wrap';
    this.wrapBtn.innerHTML = '⇄';
    this.wrapBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleWrap();
    });

    // 5d. Copy to clipboard button
    this.copyBtn = document.createElement('button');
    this.copyBtn.type = 'button';
    this.copyBtn.className = 'ink-code-tool-btn copy-btn';
    this.copyBtn.title = 'Copy code';
    this.copyBtn.innerHTML = '⧉';
    this.copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.copyCode();
    });

    // 5e. Delete code block button
    this.deleteBtn = document.createElement('button');
    this.deleteBtn.type = 'button';
    this.deleteBtn.className = 'ink-code-tool-btn delete-btn';
    this.deleteBtn.title = 'Delete code block';
    this.deleteBtn.innerHTML = '✕';
    this.deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        this.view.dispatch(
          this.view.state.tr.delete(pos, pos + this.node.nodeSize),
        );
      }
    });

    this.toolbar.appendChild(this.langBtn);
    this.toolbar.appendChild(this.wrapBtn);
    this.toolbar.appendChild(this.copyBtn);
    this.toolbar.appendChild(this.deleteBtn);
    this.toolbar.appendChild(this.langMenu);
    this.dom.appendChild(this.toolbar);

    // Initial render state
    this.applyAttributes(node.attrs);
    this.updateLineNumbers();

    // Close menu when clicking outside
    document.addEventListener('click', this.onDocumentClick);
  }

  private onDocumentClick = (e: MouseEvent) => {
    if (this.isMenuOpen && !this.toolbar.contains(e.target as Node)) {
      this.closeLanguageMenu();
    }
  };

  private getLanguageLabel(langId: string): string {
    const found = CODE_LANGUAGES.find(
      (l) => l.id.toLowerCase() === (langId || '').toLowerCase(),
    );
    return found ? found.label : (langId ? langId.toUpperCase() : 'Select language');
  }

  private populateLanguageMenu(): void {
    this.langMenu.innerHTML = '';
    CODE_LANGUAGES.forEach((lang) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ink-code-lang-item';
      if ((this.node.attrs['language'] || '').toLowerCase() === lang.id) {
        item.classList.add('selected');
      }
      item.textContent = lang.label;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectLanguage(lang.id);
      });
      this.langMenu.appendChild(item);
    });
  }

  private toggleLanguageMenu(): void {
    if (this.isMenuOpen) {
      this.closeLanguageMenu();
    } else {
      this.isMenuOpen = true;
      this.langMenu.style.display = 'block';
      this.populateLanguageMenu();
    }
  }

  private closeLanguageMenu(): void {
    this.isMenuOpen = false;
    this.langMenu.style.display = 'none';
  }

  private selectLanguage(langId: string): void {
    this.closeLanguageMenu();
    const pos = this.getPos();
    if (pos != null) {
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          language: langId,
        }),
      );
    }
  }

  private toggleWrap(): void {
    const pos = this.getPos();
    if (pos != null) {
      const newWrap = !this.node.attrs['wrap'];
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          wrap: newWrap,
        }),
      );
    }
  }

  private async copyCode(): Promise<void> {
    const text = this.node.textContent;
    try {
      await navigator.clipboard.writeText(text);
      this.copyBtn.innerHTML = '✓';
      this.copyBtn.classList.add('copied');
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.copyBtn.innerHTML = '⧉';
          this.copyBtn.classList.remove('copied');
        }
      }, 1800);
    } catch {
      // Fallback
    }
  }

  private applyAttributes(attrs: Record<string, any>): void {
    const lang = attrs['language'] || 'typescript';
    const isWrap = Boolean(attrs['wrap']);

    this.langLabel.textContent = this.getLanguageLabel(lang);
    this.contentDOM.className = `ink-code-content language-${lang}`;

    if (isWrap) {
      this.dom.classList.add('is-wrapped');
      this.wrapBtn.classList.add('active');
      this.pre.style.whiteSpace = 'pre-wrap';
      this.pre.style.wordBreak = 'break-word';
    } else {
      this.dom.classList.remove('is-wrapped');
      this.wrapBtn.classList.remove('active');
      this.pre.style.whiteSpace = 'pre';
      this.pre.style.wordBreak = 'normal';
    }
  }

  private updateLineNumbers(): void {
    const lines = (this.node.textContent || '').split('\n').length;
    if (lines === this.lineCount && this.gutter.children.length === lines) {
      return;
    }
    this.lineCount = lines;

    const frag = document.createDocumentFragment();
    for (let i = 1; i <= lines; i++) {
      const span = document.createElement('span');
      span.className = 'ink-code-line-number';
      span.textContent = String(i);
      frag.appendChild(span);
    }
    this.gutter.replaceChildren(frag);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.applyAttributes(node.attrs);
    this.updateLineNumbers();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('selected');
    this.closeLanguageMenu();
  }

  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement;
    return (
      this.toolbar.contains(target) ||
      this.langMenu.contains(target)
    );
  }

  ignoreMutation(mutation: any): boolean {
    if (mutation.target === this.contentDOM || this.contentDOM.contains(mutation.target)) {
      this.updateLineNumbers();
      return false;
    }
    return true;
  }

  destroy(): void {
    this.isDestroyed = true;
    document.removeEventListener('click', this.onDocumentClick);
  }
}
