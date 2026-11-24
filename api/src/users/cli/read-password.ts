import type { Readable, Writable } from 'node:stream';

/** Longer input is a mistake (a file piped in), not a password. */
const MAX_INPUT = 4096;

/**
 * The whole of `input` (e.g. a pipe: `--password-stdin`), without the one
 * line break at the end that `echo` and editors add. Throws for more than
 * a few kilobytes.
 */
export async function readPasswordFrom(input: Readable): Promise<string> {
  let text = '';
  for await (const chunk of input) {
    text += String(chunk);
    if (text.length > MAX_INPUT) {
      input.destroy();
      throw new Error('The input is too long to be a password');
    }
  }
  return text.replace(/\r?\n$/, '');
}

/** A terminal's input: raw mode lets keys arrive one by one, unechoed. */
export interface TerminalInput extends Readable {
  isTTY?: boolean;
  setRawMode(mode: boolean): unknown;
}

const ENTER = new Set(['\r', '\n']);
const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
/** Starts the sequences arrow and function keys send, e.g. `ESC [ A`. */
const ESCAPE = '\u001b';
const BACKSPACE = new Set(['\u007f', '\b']);

const characters = new Intl.Segmenter();

/** `text` without its last character as people see it (an emoji with skin tone is one). */
function withoutLastCharacter(text: string): string {
  const segments = Array.from(characters.segment(text), (s) => s.segment);
  return segments.slice(0, -1).join('');
}

/**
 * Asks for a password on a terminal without showing what is typed (no
 * echo, no asterisks). Enter finishes; Backspace deletes; Ctrl+C or Ctrl+D
 * cancels (rejects). Other control keys (arrows, Tab) are ignored: an
 * escape sequence arrives in one chunk, which is dropped from its start.
 */
export function promptHidden(
  question: string,
  input: TerminalInput,
  output: Writable,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';

    const finish = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
    };

    const onData = (chunk: Buffer | string) => {
      // By code point: a Cyrillic letter or an emoji is one key.
      const keys = Array.from(String(chunk));
      for (const [index, key] of keys.entries()) {
        if (ENTER.has(key)) {
          finish();
          // Typed ahead (or pasted): left for the next prompt to read. A
          // pasted CRLF is one line break.
          const next = key === '\r' && keys[index + 1] === '\n' ? 2 : 1;
          const rest = keys.slice(index + next).join('');
          if (rest) input.unshift(rest);
          resolve(value);
          return;
        }
        if (key === CTRL_C || key === CTRL_D) {
          finish();
          reject(new Error('Cancelled'));
          return;
        }
        if (key === ESCAPE) {
          break;
        }
        if (BACKSPACE.has(key)) {
          value = withoutLastCharacter(value);
        } else if (key >= ' ') {
          value += key;
        }
      }
    };

    output.write(question);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}
