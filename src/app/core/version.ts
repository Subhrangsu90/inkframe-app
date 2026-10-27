// Only `version` reaches the bundle: esbuild keeps just the used keys of a JSON import.
import { version } from '../../../package.json';

/** The app's version, from package.json (bumped with each release; see CHANGELOG.md). */
export const APP_VERSION: string = version;
