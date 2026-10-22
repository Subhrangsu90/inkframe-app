/*
 * The files the app reads, for file inputs and drops. Apart from the code
 * that reads them, which pages load only when it is needed.
 */

/** Backups end in this (see backup.ts). */
export const BACKUP_EXTENSION = '.inkframe.json';

/** For the `accept` attribute of file inputs that import documents (see doc-import.ts). */
export const IMPORT_ACCEPT =
  '.md,.markdown,.mdown,.mkd,.txt,.html,.htm,text/markdown,text/html,text/plain';
