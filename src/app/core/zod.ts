import { z } from 'zod';

/*
 * Zod for the app's own code: import `z` from here, not from 'zod'. Only
 * code that loads on demand may import it (see api-response.ts).
 *
 * Without `jitless`, Zod probes `new Function('')` to decide whether it may
 * compile parsers; the app's Content Security Policy (scripts/add-csp.mjs)
 * forbids that, so the probe fails, Zod parses without it anyway, and the
 * browser reports a policy violation every time. `jitless` skips the probe.
 */
z.config({ jitless: true });

export { z };
