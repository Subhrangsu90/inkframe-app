import { Schema } from 'prosemirror-model';
import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { paragraph } from '../extensions/document/document-schema';
import { heading } from '../extensions/heading/heading-schema';
import {
  code,
  small,
  strikethrough,
  subscript,
  superscript,
  underline,
} from '../extensions/marks/marks-schema';
import { textColor } from '../extensions/text-color/text-color-schema';
import { highlight } from '../extensions/highlight/highlight-schema';
import { link } from '../extensions/link/link-schema';
import { image } from '../extensions/image/image-schema';
import { code_block } from '../extensions/code-block/code-block-schema';
import {
  bullet_list,
  list_item,
  ordered_list,
  task_item,
  task_list,
} from '../extensions/lists/list-schema';
import { tableNodeSpecs } from '../extensions/table/table-schema';
import { callout } from '../extensions/callout/callout-schema';

/*
 * The schema with every node and mark of DEFAULT_EXTENSIONS, for working with
 * stored documents without an editor (Markdown and HTML import and export).
 * Each feature defines its own specs; an editor builds its schema from the
 * extensions it is given (ExtensionManager).
 */

// Built only for its OrderedMap of node and mark specs, which the schema below extends.
const base = new Schema({ nodes: basicNodes, marks: basicMarks });

const nodes = base.spec.nodes
  .update('paragraph', paragraph)
  .update('heading', heading)
  .update('image', image)
  .update('code_block', code_block)
  .addToEnd('task_list', task_list)
  .addToEnd('task_item', task_item)
  .addToEnd('ordered_list', ordered_list)
  .addToEnd('bullet_list', bullet_list)
  .addToEnd('list_item', list_item)
  .append(tableNodeSpecs)
  .addToEnd('callout', callout);

export { base, nodes };

export const schema = new Schema({
  nodes,
  marks: base.spec.marks
    .update('code', code)
    .update('link', link)
    .addToEnd('underline', underline)
    .addToEnd('strikethrough', strikethrough)
    .addToEnd('subscript', subscript)
    .addToEnd('superscript', superscript)
    .addToEnd('textColor', textColor)
    .addToEnd('small', small)
    .addToEnd('highlight', highlight),
});
