import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Supabase requires TLS. node-postgres maps 'sslmode=require' to
// 'verify-full' which needs a pinned CA — avoid putting sslmode in the URL
// and instead connect over TLS without CA verification (standard for a
// backend-only superuser connection to Supabase). For local dev (no SSL),
// set ssl to false by leaving the host as localhost.
const isRemote = connectionString && !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
});

export default pool;