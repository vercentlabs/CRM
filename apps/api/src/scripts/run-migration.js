import fs from 'fs';
import path from 'path';
import pool from '../config/db.js';

async function runMigration(migrationFile) {
  try {
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);
    await pool.query(migrationSQL);
    console.log(`Migration ${migrationFile} completed successfully`);
  } catch (error) {
    console.error(`Error running migration ${migrationFile}:`, error);
    process.exit(1);
  }
}

// Get migration file from command line arguments
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Please provide a migration file name');
  process.exit(1);
}

runMigration(migrationFile).then(() => {
  process.exit(0);
});
