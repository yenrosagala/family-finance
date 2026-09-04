import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set the per-request user context once a JWT is verified, so the
// DB's auth.uid() / RLS policies resolve to the logged-in user.
export function setCurrentUser(client, userId) {
  return client.query('select set_config(\'app.current_user_id\', $1, true)', [userId || '']);
}

export default pool;
