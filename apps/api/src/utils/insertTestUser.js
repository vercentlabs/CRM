import pool from '../config/db.js';
import bcrypt from 'bcrypt';

async function insertTestUser() {
  try {
    // Hash the password
    const plainPassword = 'password123';
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    // Insert the user
    const insertQuery = `
      INSERT INTO users (role_id, full_name, email, password_hash)
      VALUES (1, 'Admin Test', 'admin@test.com', $1)
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `;

    const result = await pool.query(insertQuery, [hashedPassword]);

    if (result.rows.length > 0) {
      console.log('Test user created successfully with ID:', result.rows[0].id);
      console.log('Email: admin@test.com');
      console.log('Password: password123');
    } else {
      console.log('User with this email already exists');
    }

  } catch (error) {
    console.error('Error inserting test user:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

insertTestUser();
