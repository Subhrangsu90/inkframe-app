import { Command } from 'prosemirror-state';

/**
 * Replaces the selection with an image. `src` is a web URL, a data URL or an
 * image storage URI. Does nothing when the schema has no images.
 */
export function insertImageCommand(src: string, alt: string, title: string | null = null): Command {
  return (state, dispatch) => {
    const image = state.schema.nodes['image'];
    if (!image) return false;
    dispatch?.(state.tr.replaceSelectionWith(image.create({ src, alt, title })).scrollIntoView());
    return true;
  };
}
