import { PassThrough, Readable } from 'node:stream';
import { runCreateAdmin, USAGE, type CommandIo } from './create-admin.command';

/** Streams to run the command with; `out()` and `err()` read what it wrote. */
function io(stdin: CommandIo['stdin'] = Readable.from([])) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (chunk) => (out += String(chunk)));
  stderr.on('data', (chunk) => (err += String(chunk)));
  return { io: { stdin, stdout, stderr }, out: () => out, err: () => err };
}

/*
 * The paths that end before the database is opened. Creating and promoting
 * accounts are covered by test/create-admin.e2e-spec.ts.
 */
describe('runCreateAdmin', () => {
  const openContext = jest.fn();

  afterEach(() => {
    openContext.mockReset();
  });

  it('prints the usage for --help', async () => {
    const run = io();

    expect(await runCreateAdmin(['--help'], run.io, openContext)).toBe(0);
    expect(run.out()).toBe(`${USAGE}\n`);
  });

  it.each([
    ['nothing', []],
    ['only an email', ['--email', 'a@example.com']],
    ['only a name', ['--name', 'Admin']],
    ['an unknown option', ['--promote', 'a@example.com', '--force']],
    ['a password on the command line', ['--password', 'secret']],
    [
      'a role other than admin or editor',
      ['--promote', 'a@x.com', '--role', 'customer'],
    ],
    ['--promote with --email', ['--promote', 'a@x.com', '--email', 'b@x.com']],
    [
      '--promote with --password-stdin',
      ['--promote', 'a@x.com', '--password-stdin'],
    ],
  ])('refuses %s with exit code 2 and the usage', async (_, argv) => {
    const run = io();

    expect(await runCreateAdmin(argv, run.io, openContext)).toBe(2);
    expect(run.err()).toContain(USAGE);
    expect(openContext).not.toHaveBeenCalled();
  });

  it('needs a terminal to ask for the password, or --password-stdin', async () => {
    const run = io(); // a pipe, not a TTY

    const code = await runCreateAdmin(
      ['--email', 'a@example.com', '--name', 'Admin'],
      run.io,
      openContext,
    );

    expect(code).toBe(1);
    expect(run.err()).toBe(
      'No terminal to ask for the password on: pipe it in with --password-stdin\n',
    );
    expect(openContext).not.toHaveBeenCalled();
  });

  it('refuses an empty --password-stdin', async () => {
    const run = io(Readable.from(['\n']));

    const code = await runCreateAdmin(
      ['--email', 'a@example.com', '--name', 'Admin', '--password-stdin'],
      run.io,
      openContext,
    );

    expect(code).toBe(1);
    expect(run.err()).toBe('No password on standard input\n');
    expect(openContext).not.toHaveBeenCalled();
  });

  it('reports a database it cannot open, and exits with 1', async () => {
    const run = io(Readable.from(['a long secret\n']));
    openContext.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const code = await runCreateAdmin(
      ['--email', 'a@example.com', '--name', 'Admin', '--password-stdin'],
      run.io,
      openContext,
    );

    expect(code).toBe(1);
    expect(run.err()).toBe('Failed: connect ECONNREFUSED\n');
  });
});
