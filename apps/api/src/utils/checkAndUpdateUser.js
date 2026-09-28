import pool from '../config/db.js';
import bcrypt from 'bcrypt';

async function checkAndUpdateUser() {
  try {
    // Check if the user exists
    const checkQuery = 'SELECT id, email, password_hash FROM users WHERE email = $1';
    const checkResult = await pool.query(checkQuery, ['admin@test.com']);

    if (checkResult.rows.length === 0) {
      console.log('User not found');
      return;
    }

    const user = checkResult.rows[0];
    console.log('User found:', user);

    // Test if the password "password123" matches
    const testPassword = 'password123';
    const passwordMatches = await bcrypt.compare(testPassword, user.password_hash);

    if (passwordMatches) {
      console.log('Password matches! You can use these credentials:');
      console.log('Email: admin@test.com');
      console.log('Password: password123');
    } else {
      console.log('Password does not match. Updating password...');

      // Hash the new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(testPassword, saltRounds);

      // Update the password
      const updateQuery = 'UPDATE users SET password_hash = $1 WHERE email = $2';
      await pool.query(updateQuery, [hashedPassword, 'admin@test.com']);

      console.log('Password updated successfully!');
      console.log('You can now use these credentials:');
      console.log('Email: admin@test.com');
      console.log('Password: password123');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkAndUpdateUser();
