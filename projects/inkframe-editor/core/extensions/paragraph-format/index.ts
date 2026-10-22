// readBlockFormat and blockFormatDomAttrs stay internal: the schema uses them for paragraphs and headings.
export {
  type BlockFormatAttr,
  type LineSpacing,
  type LineSpacingOption,
  BLOCK_FORMAT_ATTRS,
  INDENT_STEP_REM,
  LINE_SPACINGS,
  MAX_INDENT,
  blockFormatCss,
  lineHeightOf,
  sanitizeIndent,
  sanitizeLineSpacing,
} from './paragraph-format-schema';
export * from './paragraph-format-commands';
export * from './paragraph-format-extension';
