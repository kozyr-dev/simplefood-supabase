import { runCreateAdmin } from './create-admin.command';
import { openUsersCliContext } from './users-cli.module';

/*
 * `npm run admin:create -- --help`. Runs from dist/ with the app's `.env`
 * and config validation, like the migrations, so it also works inside the
 * production image: `node dist/users/cli/create-admin.js ...`.
 */
void runCreateAdmin(
  process.argv.slice(2),
  { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  openUsersCliContext,
).then((code) => {
  process.exitCode = code;
});
