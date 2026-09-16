import pool from './db.js';

// Shared household resolver used by all routes (replaces 16 duplicates of requireHousehold).
export function withHousehold(fn) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'select household_id from household_members where user_id = $1 limit 1',
        [req.user.id]
      );
      if (!rows[0]) {
        const e = new Error('You are not in a household yet');
        e.status = 403;
        throw e;
      }
      await fn(req, res, client, rows[0].household_id);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}

// Transaction wrapper with auto-rollback (replaces manual try/commit/rollback).
export function withTransaction(fn) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await fn(req, res, client);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      res.status(e.status || 500).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}
