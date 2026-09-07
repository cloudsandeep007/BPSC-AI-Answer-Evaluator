// Database migration runner.
//
//   npm run migrate
//
// Applies every .sql file in db/migrations/ that hasn't run yet, in filename
// order, each inside a transaction. Applied files are recorded in a
// schema_migrations table, so running this twice is safe - the second run
// does nothing.
//
// This is the ONLY way the database schema should ever change. See CLAUDE.md.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "db", "migrations");

const MISSING_URL_HELP = `
SUPABASE_DB_URL is not set in .env

Where to find it:
  Supabase dashboard -> your project -> Settings -> Database
  -> Connection string -> URI

It looks like:
  postgresql://postgres.<ref>:<password>@<host>:5432/postgres

Paste it into .env as:
  SUPABASE_DB_URL=postgresql://...
`;

async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(MISSING_URL_HELP);
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`No migrations directory at ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename    text primary key,
        applied_at  timestamptz not null default now()
      )
    `);

    const { rows } = await client.query<{ filename: string }>("select filename from schema_migrations");
    const alreadyApplied = new Set(rows.map((r) => r.filename));

    const all = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = all.filter((f) => !alreadyApplied.has(f));

    if (pending.length === 0) {
      console.log(`Database is up to date - all ${all.length} migration(s) already applied.`);
      return;
    }

    console.log(`${pending.length} migration(s) to apply:\n`);

    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      process.stdout.write(`  ${filename} ... `);

      // Each migration is all-or-nothing: a failure halfway through leaves
      // the database untouched rather than half-migrated.
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        console.error(`\n${filename} was rolled back. Nothing was changed.\n`);
        throw err;
      }
    }

    console.log(`\nDone. ${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
