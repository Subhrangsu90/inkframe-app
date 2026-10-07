import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { LandingComponent } from './pages/landing/landing.component';
import { EditorPageComponent } from './pages/editor/editor-page.component';
import { StoredDoc, imageStorage } from './editor';

describe('App Root', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app root shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should contain a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('LandingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the landing page', () => {
    const fixture = TestBed.createComponent(LandingComponent);
    const landing = fixture.componentInstance;
    expect(landing).toBeTruthy();
  });

  it('should render brand title and hero headline', async () => {
    const fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.ink-title')?.textContent).toContain('Inkframe');
    expect(compiled.querySelector('.ink-hero-headline')?.textContent).toContain('Thoughtful Writing');
  });
});

describe('EditorPageComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.location.hash = '';
    await TestBed.configureTestingModule({
      imports: [EditorPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('should create the editor page', () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const editorPage = fixture.componentInstance;
    expect(editorPage).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.ink-title')?.textContent).toContain('Inkframe');
  });

  it('should toggle between Editor and Preview tabs', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    // Default tab is edit
    expect((app as any).activeTab()).toBe('edit');

    // Switch to preview tab
    (app as any).setTab('preview');
    fixture.detectChanges();
    await fixture.whenStable();

    expect((app as any).activeTab()).toBe('preview');

    const compiled = fixture.nativeElement as HTMLElement;
    const previewPane = compiled.querySelector('.ink-preview-pane');
    expect(previewPane).toBeTruthy();

    // Switch back to edit
    (app as any).setTab('edit');
    fixture.detectChanges();
    await fixture.whenStable();
    expect((app as any).activeTab()).toBe('edit');
  });

  it('should generate a share link with view=preview', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await (app as any).shareDocument();
    fixture.detectChanges();
    await fixture.whenStable();

    const shareUrl = (app as any).shareUrl();
    expect(shareUrl).toContain('view=preview');
    expect(shareUrl).toContain('#share=');
    expect((app as any).showShareModal()).toBe(true);
  });

  it('should support exportDocs and exportPdf without errors', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await expect((app as any).exportDocs()).resolves.not.toThrow();
    await expect((app as any).exportPdf()).resolves.not.toThrow();
  });

  it('should inline image data URLs when sharing a document', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await (app as any).initClientState();
    await fixture.whenStable();

    const docWithImage = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Document with image' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'image',
                attrs: {
                  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                  alt: 'Pixel',
                },
              },
            ],
          },
        ],
      },
    };

    (app as any).currentDoc.set(docWithImage);
    if ((app as any).editor()) {
      (app as any).editor().loadDoc(docWithImage);
    }
    await (app as any).shareDocument();
    fixture.detectChanges();
    await fixture.whenStable();

    const shareUrl = (app as any).shareUrl();
    expect(shareUrl).toContain('view=preview');
    expect(shareUrl).toContain('#share=');
    // Ensure the shared doc contains the valid image src
    expect((app as any).currentDoc().doc.content[1].content[0].attrs.src).toContain('data:image/png;base64');
  });

  it('should resolve preview HTML without broken ink-idb protocols', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await (app as any).setTab('preview');
    fixture.detectChanges();
    await fixture.whenStable();

    const htmlString = String((app as any).sanitizedPreviewHtml());
    expect(htmlString).not.toContain('src="ink-idb:');
  });

  it('should toggle theme between dark and light and synchronize across editor and preview', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const themeService = (app as any).themeService;
    expect(themeService).toBeTruthy();

    // Default theme is dark
    expect(themeService.theme()).toBe('dark');

    // Toggle to light theme
    themeService.toggleTheme();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(themeService.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);

    // Switch to preview tab: theme remains light
    await (app as any).setTab('preview');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(themeService.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Toggle back to dark while in preview
    themeService.toggleTheme();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(themeService.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);

    // Switch back to editor tab: theme remains dark
    await (app as any).setTab('edit');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(themeService.theme()).toBe('dark');
  });

  it('should open image lightbox when an image in preview is clicked and close when dismissed', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    expect((app as any).previewLightbox()).toBeNull();

    // Simulate clicking an img element inside preview
    const fakeImg = document.createElement('img');
    fakeImg.src = 'https://example.com/test.png';
    fakeImg.alt = 'Test Image';
    fakeImg.title = 'Test Title';

    let prevented = false;
    let stopped = false;
    const fakeEvent = {
      target: fakeImg,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    } as unknown as MouseEvent;

    (app as any).onPreviewClick(fakeEvent);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect((app as any).previewLightbox()).toEqual({
      src: 'https://example.com/test.png',
      alt: 'Test Image',
      title: 'Test Title',
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('ink-image-lightbox')).toBeTruthy();

    // Dismiss lightbox
    (app as any).closePreviewLightbox();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((app as any).previewLightbox()).toBeNull();
    expect(compiled.querySelector('ink-image-lightbox')).toBeNull();
  });

  it('should persist document to IndexedDB storage and open share modal immediately', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await (app as any).saveDocument();
    expect((app as any).isDirty()).toBe(false);

    // Trigger share
    const sharePromise = (app as any).shareDocument();
    // Modal opens immediately upon calling
    expect((app as any).showShareModal()).toBe(true);

    await sharePromise;
    fixture.detectChanges();
    await fixture.whenStable();

    expect((app as any).isGeneratingShareLink()).toBe(false);
    expect((app as any).shareUrl()).toContain('view=preview');
  });

  it('should successfully share and inline images located inside table cells', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const { uri: imageKey } = await imageStorage.saveImage(
      new Blob(['fake-table-image-content'], { type: 'image/png' })
    );

    const docWithTableImage: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [
                  {
                    type: 'table_cell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'image',
                            attrs: {
                              src: imageKey,
                              alt: 'Table Image',
                              title: null,
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    (app as any).currentDoc.set(docWithTableImage);
    if ((app as any).editor() && (app as any).editor().svc?.view) {
      (app as any).editor().loadDoc(docWithTableImage);
    }

    await (app as any).shareDocument();
    fixture.detectChanges();
    await fixture.whenStable();

    const shareUrl = (app as any).shareUrl();
    expect(shareUrl).toContain('view=preview');
    expect(shareUrl).toContain('#share=');

    // Verify the image inside the table cell was properly inlined to a data URL
    const tableNode = (app as any).currentDoc().doc.content[0];
    const cellNode = tableNode.content[0].content[0];
    const paraNode = cellNode.content[0];
    const imgNode = paraNode.content[0];
    expect(imgNode.attrs.src).toContain('data:image/png;base64');
  });

  it('should gracefully fall back to saved document if share URL hash is truncated or malformed', async () => {
    const savedDoc: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Recovered Document from Storage' }],
          },
        ],
      },
    };

    await imageStorage.saveDocument('inkframe_saved_doc', savedDoc);
    await imageStorage.saveDocument('inkframe_doc_doc_default', savedDoc);

    // Simulate truncated URL hash (like the Chromium 384KB URL truncation)
    const truncatedHash = '#share=' + encodeURIComponent('eyJzY2hlbWFWZXJzaW9uIjoxLCJkb2MiOnsidHlwZSI6ImRvYyIsImNvbnRlbnQiOlt7');
    window.location.hash = truncatedHash;

    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await (app as any).initClientState();
    fixture.detectChanges();
    await fixture.whenStable();

    // Verify it recovered from IndexedDB/localStorage rather than crashing or staying on demo
    expect((app as any).currentDoc().doc.content[0].content[0].text).toBe('Recovered Document from Storage');
  });

  it('should support creating multiple documents, listing history, and switching between them', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    // Open drawer
    await (app as any).openDocDrawer();
    expect((app as any).showDocDrawer()).toBe(true);
    const initialCount = (app as any).docList().length;

    // Create a new document
    await (app as any).createNewDoc();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((app as any).docList().length).toBe(initialCount + 1);
    expect((app as any).showDocDrawer()).toBe(false);

    const doc2Id = (app as any).activeDocId();
    expect((app as any).currentDocTitle()).toBe('Untitled Document');

    // Switch back to original doc
    const firstDocId = (app as any).docList().find((d: any) => d.id !== doc2Id)?.id;
    if (firstDocId) {
      await (app as any).switchDoc(firstDocId);
      fixture.detectChanges();
      await fixture.whenStable();

      expect((app as any).activeDocId()).toBe(firstDocId);
    }
  });

  it('should support duplicating and deleting documents from history', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const activeId = (app as any).activeDocId();
    const fakeEvent = { stopPropagation: () => {}, preventDefault: () => {} } as any;

    // Duplicate document
    await (app as any).duplicateDoc(activeId, fakeEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    const duplicatedTitle = (app as any).currentDocTitle();
    expect(duplicatedTitle).toContain('(Copy)');
    const duplicatedId = (app as any).activeDocId();

    // Delete duplicated document
    await (app as any).deleteDoc(duplicatedId, fakeEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    const remaining = (app as any).docList().map((d: any) => d.id);
    expect(remaining).not.toContain(duplicatedId);
  });

  it('should prompt delete warning dialog before deleting from history and cancel or confirm', async () => {
    const fixture = TestBed.createComponent(EditorPageComponent);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const fakeEvent = { stopPropagation: () => {}, preventDefault: () => {} } as any;

    // Create a new doc to test deletion dialog
    await (app as any).createNewDoc();
    fixture.detectChanges();
    await fixture.whenStable();

    const createdId = (app as any).activeDocId();
    const docMeta = (app as any).docList().find((d: any) => d.id === createdId);
    expect(docMeta).toBeTruthy();

    // Trigger delete prompt
    (app as any).promptDeleteDoc(docMeta, fakeEvent);
    fixture.detectChanges();
    expect((app as any).docToDelete()).toBe(docMeta);

    // Cancel deletion
    (app as any).cancelDeleteDoc();
    fixture.detectChanges();
    expect((app as any).docToDelete()).toBeNull();
    expect((app as any).docList().some((d: any) => d.id === createdId)).toBe(true);

    // Prompt again and confirm deletion
    (app as any).promptDeleteDoc(docMeta, fakeEvent);
    fixture.detectChanges();
    await (app as any).confirmDeleteDoc();
    fixture.detectChanges();
    await fixture.whenStable();

    expect((app as any).docToDelete()).toBeNull();
    expect((app as any).docList().some((d: any) => d.id === createdId)).toBe(false);
  });
});
