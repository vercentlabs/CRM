import pool from '../config/db.js';

async function checkLeadsTable() {
  try {
    // Check if the leads table exists
    const tableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'leads'
      );
    `;
    const tableResult = await pool.query(tableQuery);
    const tableExists = tableResult.rows[0].exists;

    if (!tableExists) {
      console.log('Leads table does not exist');
      return;
    }

    console.log('Leads table exists');

    // Get table structure
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'leads'
      ORDER BY ordinal_position;
    `;
    const schemaResult = await pool.query(schemaQuery);

    console.log('Leads table schema:');
    console.table(schemaResult.rows);

    // Check if there are any leads in the table
    const countQuery = 'SELECT COUNT(*) FROM leads';
    const countResult = await pool.query(countQuery);
    console.log(`Number of leads in the table: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('Error checking leads table:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkLeadsTable();
