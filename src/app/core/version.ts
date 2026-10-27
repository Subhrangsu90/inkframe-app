// Only `version` reaches the bundle: esbuild keeps just the used keys of a JSON import.
// package.json is outside src/, where no @app/ alias reaches, hence the relative path.
// eslint-disable-next-line no-restricted-imports
import { version } from '../../../package.json';

/** The app's version, from package.json (bumped with each release; see CHANGELOG.md). */
export const APP_VERSION: string = version;
