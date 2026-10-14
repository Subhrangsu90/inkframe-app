import { describe, it, expect } from 'vitest';
import { schema } from '../../schema/schema';

describe('Heading node', () => {
  it('supports block level conversions and headings 1 to 6', () => {
    for (let level = 1; level <= 6; level++) {
      const h = schema.nodes['heading'].create({ level }, [schema.text(`Heading ${level}`)]);
      expect(h.attrs['level']).toBe(level);
      expect(h.textContent).toBe(`Heading ${level}`);
    }
  });
});
