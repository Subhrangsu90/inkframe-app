import { createExtension } from '../../editor/extension-types';
import { image } from './image-schema';
import { ImageNodeView } from './image.node-view';

export const ImageExtension = createExtension({
  name: 'image',
  nodes: { image },
  nodeViews: (ctx) => ({
    image: (node, view, getPos) =>
      new ImageNodeView(node, view, getPos, (data) => ctx.service.openImagePreview(data)),
  }),
  slashItems: [
    {
      id: 'img',
      label: 'Image',
      hint: 'Upload image (indexedDB backed)',
      icon: 'image',
      keywords: ['image', 'photo', 'picture', 'upload'],
      run: (s) => {
        if (typeof document === 'undefined') return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) s.insertImage(file);
        };
        input.click();
      },
    },
  ],
});
