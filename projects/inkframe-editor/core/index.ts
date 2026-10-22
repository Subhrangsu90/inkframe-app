// Secondary entry point: @inkframe-ui/editor/core

// The editor: service, extension system and menu coordination
export * from './editor/editor-service';
export * from './editor/editor-hooks';
export * from './editor/extension-types';
export * from './editor/extension-manager';
export * from './editor/menus.plugin';
export * from './editor/doc-stats';

// Features, one folder each, and the default set
export * from './extensions/blockquote';
export * from './extensions/callout';
export * from './extensions/clear-formatting';
export * from './extensions/code-block';
export * from './extensions/divider';
export * from './extensions/document';
export * from './extensions/font-family';
export * from './extensions/font-size';
export * from './extensions/heading';
export * from './extensions/highlight';
export * from './extensions/history';
export * from './extensions/image';
export * from './extensions/link';
export * from './extensions/lists';
export * from './extensions/marks';
export * from './extensions/page-setup';
export * from './extensions/paragraph-format';
export * from './extensions/paste-cleanup';
export * from './extensions/placeholder';
export * from './extensions/search';
export * from './extensions/table';
export * from './extensions/text-align';
export * from './extensions/text-color';
export * from './extensions/starter-kit';

// Documents without an editor: schema, migrations, import and export
export * from './schema/schema';
export * from './schema/migrations';
export * from './schema/sanitize-css';
export * from './io/html';
export * from './io/html-document';
export * from './io/markdown';
export * from './io/page-starts';

// Image storage and UI helpers
export * from './storage/image-storage';
export * from './ui-helpers/colors';
export * from './ui-helpers/theme';
export * from './ui-helpers/visual-viewport';
export * from './ui-helpers/keep-menu-open.directive';

// Deprecated; removed in 2.0
export * from './legacy';
