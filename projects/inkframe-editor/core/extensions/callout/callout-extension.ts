import { createExtension } from '../../editor/extension-types';
import { callout } from './callout-schema';
import { CalloutNodeView } from './callout.node-view';

export const CalloutExtension = createExtension({
  name: 'callout',
  nodes: { callout },
  nodeViews: (ctx) => ({
    callout: (node, view, getPos) =>
      new CalloutNodeView(node, view, getPos, ctx.service.envInjector, ctx.service.appReference),
  }),
  slashItems: [
    {
      id: 'cl',
      label: 'Callout',
      hint: 'Highlighted note or alert block',
      icon: 'info',
      keywords: ['note', 'info', 'callout', 'alert'],
      run: (s) => s.insertCallout('info'),
    },
  ],
});
