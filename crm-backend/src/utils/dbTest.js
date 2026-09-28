const pool = require('../db');

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Query result:', result.rows[0]);
    console.log('Database connection test successful!');
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    // End the pool to ensure all connections are closed
    await pool.end();
    console.log('Pool has been closed, exiting process.');
    process.exit(0);
  }
}

testConnection();
