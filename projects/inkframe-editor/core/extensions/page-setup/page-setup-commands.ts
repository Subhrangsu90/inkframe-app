import { Command } from 'prosemirror-state';
import { PageSetup, normalizePageSetup, samePageSetup } from './page-setup';

/**
 * Sets the document's page setup in one transaction, so one undo step. Null
 * removes it (back to the defaults). Does nothing when the schema's `doc`
 * node has no `page` attribute or the setup is unchanged.
 */
export function setPageSetupCommand(setup: PageSetup | null): Command {
  return (state, dispatch) => {
    if (!('page' in (state.schema.topNodeType.spec.attrs ?? {}))) return false;
    const next = normalizePageSetup(setup);
    if (samePageSetup(normalizePageSetup(state.doc.attrs['page']), next)) return false;
    dispatch?.(state.tr.setDocAttribute('page', next));
    return true;
  };
}
