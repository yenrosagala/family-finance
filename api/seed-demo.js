import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

const email = 'demo@family.local';
const password = 'demo1234';
const displayName = 'Demo Admin';

const hash = bcrypt.hashSync(password, 10);

try {
  const { rows } = await pool.query(
    `insert into app_users (email, password_hash, display_name)
     values ($1, $2, $3)
     on conflict (email) do update
       set password_hash = excluded.password_hash,
           display_name = excluded.display_name
     returning id, email, display_name`,
    [email, hash, displayName]
  );
  console.log('UPSERTED:', JSON.stringify(rows[0]));
  const check = await pool.query(
    'select password_hash from app_users where email=$1',
    [email]
  );
  const stored = check.rows[0].password_hash;
  console.log('STORED HASH:', stored);
  console.log('VERIFIES:', bcrypt.compareSync(password, stored));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
