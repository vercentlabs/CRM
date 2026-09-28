// Load environment variables first
import 'dotenv/config';

import app from './app.js';

// Get port from environment variables or use default
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
