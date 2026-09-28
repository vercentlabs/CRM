import pool from '../config/db.js';

async function testUsersTable() {
  try {
    // Check if the users table exists
    const tableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `;
    const tableResult = await pool.query(tableQuery);
    const tableExists = tableResult.rows[0].exists;

    if (!tableExists) {
      console.log('Users table does not exist');
      return;
    }

    console.log('Users table exists');

    // Get table structure
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `;
    const schemaResult = await pool.query(schemaQuery);

    console.log('Users table schema:');
    console.table(schemaResult.rows);

    // Check if there are any users in the table
    const countQuery = 'SELECT COUNT(*) FROM users';
    const countResult = await pool.query(countQuery);
    console.log(`Number of users in the table: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('Error checking users table:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testUsersTable();
