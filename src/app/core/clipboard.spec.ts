import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { copyText } from './clipboard';

/** A ClipboardItem that keeps what it was given. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}

describe('copyText', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(async () => {});
    write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, write },
      configurable: true,
    });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('writes finished text directly', async () => {
    await copyText('https://inkframe.app/s#c_abc');
    expect(writeText).toHaveBeenCalledWith('https://inkframe.app/s#c_abc');
    expect(write).not.toHaveBeenCalled();
  });

  it('starts the write before text still being made is ready (for Safari)', async () => {
    let finish!: (url: string) => void;
    const url = new Promise<string>((resolve) => (finish = resolve));
    const copied = copyText(url);

    // Called synchronously, while the click still allows it.
    expect(write).toHaveBeenCalledTimes(1);
    finish('https://inkframe.app/s#c_abc');
    await copied;

    const [item] = write.mock.calls[0][0] as FakeClipboardItem[];
    expect(await (await item.items['text/plain']).text()).toBe('https://inkframe.app/s#c_abc');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to writeText where a ClipboardItem cannot wait for its data', async () => {
    write.mockRejectedValue(new TypeError('Failed to execute write'));
    await copyText(Promise.resolve('link'));
    expect(writeText).toHaveBeenCalledWith('link');
  });

  it('throws when the text could not be made, or the browser refuses', async () => {
    write.mockImplementation(async ([item]: FakeClipboardItem[]) => {
      await item.items['text/plain'];
    });
    await expect(copyText(Promise.reject(new Error('no document')))).rejects.toThrow('no document');

    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(copyText('link')).rejects.toThrow('Denied');

    Reflect.deleteProperty(navigator, 'clipboard');
    await expect(copyText('link')).rejects.toThrow(/no clipboard/);
  });
});
