import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a connection pool to the default 'postgres' database
const initPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'postgres', // Connect to default database first
  port: process.env.DB_PORT || 5432,
});

async function initializeDatabase() {
  const client = await initPool.connect();

  try {
    console.log('Connected to PostgreSQL');

    // Create the database if it doesn't exist
    const dbName = process.env.DB_NAME || 'crm_db';

    // Terminate all connections to the database before dropping
    await new Promise((resolve, reject) => {
      client.query(`SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${dbName}' AND pid <> pg_backend_pid();`, (err, res) => {
        if (err) {
          // Ignore error if database doesn't exist
          console.log('No active connections to terminate');
        }
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      client.query(`DROP DATABASE IF EXISTS ${dbName}`, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`Database ${dbName} dropped (if existed)`);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      client.query(`CREATE DATABASE ${dbName}`, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`Database ${dbName} created successfully`);
        resolve();
      });
    });

    // Close the connection to postgres database
    client.release();
    await initPool.end();

    // Connect to the new database
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: dbName,
      port: process.env.DB_PORT || 5432,
    });

    const dbClient = await new Promise((resolve, reject) => {
      pool.connect((err, client) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(client);
      });
    });

    // Read and execute the schema file
    // Schema snapshot now lives in the forward-only migrations folder (Phase 1).
    const schemaPath = path.join(__dirname, '..', 'migrations', '0001_baseline_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await new Promise((resolve, reject) => {
      dbClient.query(schema, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Schema executed successfully');
        resolve();
      });
    });

    dbClient.release();
    await pool.end();

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();
