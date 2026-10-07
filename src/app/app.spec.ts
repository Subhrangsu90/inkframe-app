import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.ink-title')?.textContent).toContain('Inkframe');
  });

  it('should toggle between Editor and Preview tabs', async () => {
    const fixture = TestBed.createComponent(App);
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
    const fixture = TestBed.createComponent(App);
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
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await expect((app as any).exportDocs()).resolves.not.toThrow();
    await expect((app as any).exportPdf()).resolves.not.toThrow();
  });

  it('should inline image data URLs when sharing a document', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
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

    if ((app as any).editor()) {
      (app as any).editor().loadDoc(docWithImage);
    } else {
      (app as any).currentDoc.set(docWithImage);
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
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    await (app as any).setTab('preview');
    fixture.detectChanges();
    await fixture.whenStable();

    const htmlString = String((app as any).sanitizedPreviewHtml());
    expect(htmlString).not.toContain('src="ink-idb:');
  });

  it('should toggle theme between dark and light and synchronize across editor and preview', async () => {
    const fixture = TestBed.createComponent(App);
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
    const fixture = TestBed.createComponent(App);
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
    const fixture = TestBed.createComponent(App);
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
});
