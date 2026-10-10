import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor as InkEditor } from '@inkframe-ui/editor';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { StoredDoc, Theme } from '@inkframe-ui/editor/core';
import { ToastService } from '../../shared/ui';
import { extractDocWordCount } from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';

interface FaqItem {
  category: 'storage' | 'sync' | 'pwa';
  categoryLabel: string;
  question: string;
  answerHtml: SafeHtml;
}

@Component({
  selector: 'ink-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    InkEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  protected readonly theme = inject(Theme);
  protected readonly toastService = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  public readonly editorRef = viewChild<InkEditor>('editor');

  // Sticky header scroll & intersection states
  public readonly isScrolled = signal<boolean>(false);
  public readonly activeSection = signal<string>('features');

  // Starter document inside MacBook frame
  public readonly previewDoc: StoredDoc = WELCOME_DOC;

  public readonly wordCount = signal<number>(extractDocWordCount(WELCOME_DOC));
  public readonly readingTime = computed(() =>
    Math.max(1, Math.ceil(this.wordCount() / 200)),
  );
  public readonly autosaveStatus = signal<'Saved locally ✓' | 'Saving to WASM...'>('Saved locally ✓');

  // Feature cards interactive state
  public readonly activeSlash = signal<'table' | 'checklist' | 'callout' | 'code'>('table');
  public readonly sampleTask1 = signal(true);
  public readonly sampleTask2 = signal(false);
  public readonly activeRevision = signal('Checkpoint 14:02');
  public readonly isCardDark = signal(true);

  // FAQ state
  public readonly activeFaqCategory = signal<'all' | 'storage' | 'sync' | 'pwa'>('all');
  public readonly openFaqIndex = signal<number | null>(0);

  public readonly faqs: FaqItem[] = [
    {
      category: 'storage',
      categoryLabel: 'Storage',
      question: 'Where is my document data stored?',
      answerHtml: this.sanitizer.bypassSecurityTrustHtml(
        '<p>Entirely within your browser\'s dedicated local storage runtime using <code>WASM SQLite</code> and <code>IndexedDB.wal</code>.</p><p>Keystrokes, drafts, and preferences never touch external servers or cloud queues unless you explicitly generate an end-to-end encrypted peer share link.</p>',
      ),
    },
    {
      category: 'storage',
      categoryLabel: 'Data Safety',
      question: 'What happens if I clear my browser cache or data?',
      answerHtml: this.sanitizer.bypassSecurityTrustHtml(
        '<p>Full browser storage purges or incognito session closures clear volatile local storage. Inkframe makes safety painless by allowing instantaneous exports to standard <code>Markdown (.md)</code>, clean HTML, or structured JSON workspace backups.</p><p>You also maintain complete local revision checkpoint rewinds within any active document.</p>',
      ),
    },
    {
      category: 'sync',
      categoryLabel: 'Limits',
      question: 'Are there limits on shared links or document count?',
      answerHtml: this.sanitizer.bypassSecurityTrustHtml(
        '<p>No arbitrary limits. Because parsing and indexing operate entirely client-side on your processor, you are bounded solely by your machine\'s physical disk space.</p><p>Shared snapshots are serialized into URL hash fragments with <code>AES-GCM</code> encryption, requiring zero central database allocation.</p>',
      ),
    },
    {
      category: 'pwa',
      categoryLabel: 'Offline PWA',
      question: 'Can I use Inkframe completely disconnected from Wi-Fi?',
      answerHtml: this.sanitizer.bypassSecurityTrustHtml(
        '<p>Absolutely. Inkframe functions as an installable <code>Progressive Web App (PWA)</code>. Once cached, all compiled WebAssembly and asset bundles execute with zero network requests.</p><p>Enable Airplane Mode, restart your computer, or write at 35,000 feet — your canvas is unaffected.</p>',
      ),
    },
  ];

  public readonly filteredFaqs = computed(() => {
    const cat = this.activeFaqCategory();
    if (cat === 'all') {
      return this.faqs;
    }
    return this.faqs.filter((f) => f.category === cat);
  });

  // Editor Event Handlers
  protected onDocChanged(doc: StoredDoc): void {
    const count = extractDocWordCount(doc);
    this.wordCount.set(count);
    this.pulseSave();
  }

  protected pulseSave(): void {
    this.autosaveStatus.set('Saving to WASM...');
    setTimeout(() => {
      this.autosaveStatus.set('Saved locally ✓');
    }, 350);
  }

  protected focusEditor(): void {
    this.scrollToPreview();
    setTimeout(() => {
      this.editorRef()?.focus();
      this.toastService.info('Editor canvas focused. Start typing or type / for commands.');
    }, 300);
  }

  protected copyHeroShareLink(): void {
    this.toastService.success(
      'Document share link copied: inkframe.app/doc/architecture-notes',
    );
  }

  protected copySnapshotLink(): void {
    this.toastService.success('Snapshot share URL copied to clipboard');
  }

  protected copyEncryptedLink(): void {
    this.toastService.success('Private link copied to clipboard');
  }

  protected fakeExport(format: string): void {
    this.toastService.success(`Prepared local export: Document.${format.toLowerCase()}`);
  }

  protected selectRevision(rev: string): void {
    this.activeRevision.set(rev);
    this.toastService.info(`Restored checkpoint from ${rev}`);
  }

  protected setSlashPreview(type: 'table' | 'checklist' | 'callout' | 'code'): void {
    this.activeSlash.set(type);
    this.toastService.info(`Previewing /${type} block schema`);
  }

  protected toggleFaq(index: number): void {
    if (this.openFaqIndex() === index) {
      this.openFaqIndex.set(null);
    } else {
      this.openFaqIndex.set(index);
    }
  }

  constructor() {
    afterNextRender(() => {
      if (typeof window === 'undefined') return;

      const onScroll = () => {
        this.isScrolled.set(window.scrollY > 20);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      const sectionIds = ['features', 'interactive-playground', 'shortcuts', 'faq'];
      const sectionElements = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.activeSection.set(entry.target.id);
            }
          }
        },
        {
          rootMargin: '-80px 0px -40% 0px',
          threshold: 0.15,
        },
      );

      sectionElements.forEach((el) => observer.observe(el));

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        observer.disconnect();
      });
    });
  }

  protected scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      this.activeSection.set(sectionId);
      history.replaceState(null, '', `#${sectionId}`);
    }
  }

  protected scrollToPreview(): void {
    const el = document.getElementById('editor-preview-card');
    el?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Backward compatibility alias for existing tests
export { Landing as LandingComponent };
