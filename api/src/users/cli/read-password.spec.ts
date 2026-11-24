import { PassThrough, Readable } from 'node:stream';
import {
  promptHidden,
  readPasswordFrom,
  type TerminalInput,
} from './read-password';

/** A fake terminal: keys are written into it; raw mode is recorded. */
function terminal(): PassThrough & TerminalInput & { rawModes: boolean[] } {
  const input = new PassThrough() as PassThrough &
    TerminalInput & { rawModes: boolean[] };
  input.isTTY = true;
  input.rawModes = [];
  input.setRawMode = (mode: boolean) => input.rawModes.push(mode);
  return input;
}

/** Everything written to it, as one string. */
function capture() {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => (text += String(chunk)));
  return { output, text: () => text };
}

/** Types each string as one chunk (a key, or a paste). */
function type(input: PassThrough, ...chunks: string[]) {
  for (const chunk of chunks) input.write(chunk);
}

describe('readPasswordFrom', () => {
  it.each([
    ['as it is', 'secret pass', 'secret pass'],
    ['without the line break echo adds', 'secret pass\n', 'secret pass'],
    ['without a Windows line break', 'secret pass\r\n', 'secret pass'],
    ['with spaces kept', '  secret pass  \n', '  secret pass  '],
    ['only one line break removed', 'secret\n\n', 'secret\n'],
    ['in several chunks', ['sec', 'ret\n'], 'secret'],
  ])('reads the password %s', async (_, input, password) => {
    expect(await readPasswordFrom(Readable.from([input].flat()))).toBe(
      password,
    );
  });

  it('refuses input far too long to be a password', async () => {
    await expect(
      readPasswordFrom(Readable.from(['x'.repeat(5000)])),
    ).rejects.toThrow('too long');
  });
});

describe('promptHidden', () => {
  it('returns what was typed, showing only the question', async () => {
    const input = terminal();
    const { output, text } = capture();

    const answer = promptHidden('Password: ', input, output);
    type(input, 's', 'e', 'c', 'ret pass', '\r');

    expect(await answer).toBe('secret pass');
    expect(text()).toBe('Password: \n');
  });

  it('leaves what was typed after Enter for the next prompt (a paste)', async () => {
    const input = terminal();
    const { output } = capture();

    const first = promptHidden('Password: ', input, output);
    type(input, 'secret one\rsecret two\r');
    expect(await first).toBe('secret one');

    expect(await promptHidden('Repeat: ', input, output)).toBe('secret two');
  });

  it('treats a pasted CRLF as one line break', async () => {
    const input = terminal();
    const { output } = capture();

    const first = promptHidden('Password: ', input, output);
    type(input, 'secret one\r\nsecret two\r\n');
    expect(await first).toBe('secret one');

    expect(await promptHidden('Repeat: ', input, output)).toBe('secret two');
  });

  it('turns raw mode on while asking, and off again', async () => {
    const input = terminal();

    const answer = promptHidden('?', input, capture().output);
    type(input, 'x\n');
    await answer;

    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount('data')).toBe(0);
  });

  it('deletes the last character on Backspace, an emoji as a whole', async () => {
    const input = terminal();

    const answer = promptHidden('?', input, capture().output);
    type(input, 'Пароль👍🏽', '\u007f', 'ь', '\b', '!', '\r');

    expect(await answer).toBe('Пароль!');
  });

  it('ignores arrow keys and other control keys', async () => {
    const input = terminal();

    const answer = promptHidden('?', input, capture().output);
    type(input, 'a', '\u001b[D', '\t', 'b', '\u001bOA', '\r');

    expect(await answer).toBe('ab');
  });

  it.each([
    ['Ctrl+C', '\u0003'],
    ['Ctrl+D', '\u0004'],
  ])('is cancelled by %s, and restores the terminal', async (_, key) => {
    const input = terminal();

    const answer = promptHidden('?', input, capture().output);
    type(input, 'abc', key);

    await expect(answer).rejects.toThrow('Cancelled');
    expect(input.rawModes).toEqual([true, false]);
  });
});
