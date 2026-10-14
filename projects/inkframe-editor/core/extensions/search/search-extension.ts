import { createExtension } from '../../editor/extension-types';
import {
  findNextCommand,
  findPreviousCommand,
  getSearchState,
  searchPlugin,
} from './search.plugin';

const whileSearching =
  (command: typeof findNextCommand): typeof findNextCommand =>
  (state, dispatch, view) =>
    !!getSearchState(state)?.query && command(state, dispatch, view);

export const SearchExtension = createExtension({
  name: 'search',
  plugins: () => [searchPlugin()],
  keymaps: (ctx) => ({
    'Mod-f': () => {
      ctx.service.openSearch();
      return true; // instead of the browser's find bar, which cannot see into the editor's state
    },
    // Mod-h on Windows and Linux, Shift-Mod-h on macOS (where Cmd+H hides the app).
    'Mod-h': () => {
      ctx.service.openSearch({ replace: true });
      return true;
    },
    'Shift-Mod-h': () => {
      ctx.service.openSearch({ replace: true });
      return true;
    },
    'Mod-g': whileSearching(findNextCommand),
    'Shift-Mod-g': whileSearching(findPreviousCommand),
    Escape: () => {
      if (!ctx.service.searchOpen()) return false;
      ctx.service.closeSearch();
      return true;
    },
  }),
});
