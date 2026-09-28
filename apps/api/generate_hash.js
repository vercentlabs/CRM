import bcrypt from 'bcrypt';

// Use a strong password that meets the requirements:
// - At least 8 characters
// - At least one letter and one number
const password = 'Admin@123';

bcrypt.hash(password, 12)
  .then(hash => {
    console.log('Password:', password);
    console.log('Hash:', hash);
  })
  .catch(err => console.error(err));