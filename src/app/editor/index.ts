// Public API barrel
export { EditorComponent } from './editor.component';
export { EditorService, type BlockInfo, type MountOptions } from './editor.service';
export { type StoredDoc, SCHEMA_VERSION, migrate } from './core/migrations';
export { schema } from './core/schema';
export { docToHtml, htmlToDoc } from './io/html';
export { docToMarkdown, markdownToDoc } from './io/markdown';
export { imageStorage, type StoredImageMetadata } from './core/image-storage';
export { CALLOUT_KINDS, type CalloutKind } from './core/schema';
