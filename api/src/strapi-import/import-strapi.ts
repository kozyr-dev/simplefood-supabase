import { parseArgs } from 'node:util';
import mediaConfig from '@/config/media.config';
// The TypeORM CLI's data source: same env file, same validation, same options.
import dataSource from '@/database/data-source';
import { importStrapi } from './services/import-strapi';

/*
 * One-off: copies the Strapi site (SQLite + uploads) into this API's
 * database and UPLOADS_DIR. Run from api/:
 *
 *   npm run import:strapi -- --sqlite ../backend/.tmp/data.db \
 *     --uploads ../backend/public/uploads [--dry-run] [--replace]
 *
 * Prints counts and warnings only: never names, emails or other values.
 */
const USAGE =
  'Usage: npm run import:strapi -- --sqlite <data.db> --uploads <uploads dir> [--dry-run] [--replace]';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      sqlite: { type: 'string' },
      uploads: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      replace: { type: 'boolean', default: false },
    },
  });
  if (!values.sqlite || !values.uploads) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  await dataSource.initialize();
  try {
    const report = await importStrapi(dataSource, {
      sqlitePath: values.sqlite,
      uploadsSource: values.uploads,
      uploadsTarget: mediaConfig().uploadsDir,
      replace: values.replace,
      dryRun: values['dry-run'],
    });

    console.log(
      report.dryRun
        ? 'Dry run: everything imported and checked, then rolled back. Nothing was saved or copied.'
        : 'Imported and checked.',
    );
    for (const [name, count] of Object.entries(report.counts)) {
      console.log(`  ${name.padEnd(20)} ${count}`);
    }
    console.log(
      `  files                ${report.files.length} (${report.filesCopied} copied, ${report.filesUnchanged} already there)`,
    );
    if (report.warnings.length) {
      console.log(`Warnings (${report.warnings.length}):`);
      for (const warning of report.warnings) console.log(`  - ${warning}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Import failed; the database is unchanged.\n',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
