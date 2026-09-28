import { Pool } from 'pg';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Configure PostgreSQL to parse array types correctly
const { types } = pg;

// Parse INT8 (bigint) as number
types.setTypeParser(types.builtins.INT8, (value) => {
  return parseInt(value, 10);
});

// Parse TEXT arrays correctly (for tags field)
const parseArray = (value) => {
  if (!value) return [];
  try {
    // Remove the curly braces and split by comma
    const cleanValue = value.replace(/^{|}$/g, '');
    if (!cleanValue) return [];
    return cleanValue.split(',').map(item => {
      // Remove quotes if present
      const trimmed = item.trim();
      return trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed;
    });
  } catch (e) {
    console.error('Error parsing array:', e);
    return [];
  }
};

types.setTypeParser(types.builtins.TEXT_ARRAY, parseArray);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export default pool;
