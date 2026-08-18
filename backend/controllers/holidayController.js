import { pool } from '../db/pool.js';

export async function getHolidays(req, res) {
  const { region } = req.query;
  try {
    const query = region && region !== 'ALL'
      ? "SELECT id, region, holiday_date::text as \"holidayDate\", name FROM holidays WHERE region = $1 ORDER BY holiday_date ASC"
      : "SELECT id, region, holiday_date::text as \"holidayDate\", name FROM holidays ORDER BY region, holiday_date ASC";
    const result = region && region !== 'ALL'
      ? await pool.query(query, [region])
      : await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createHoliday(req, res) {
  const { region, holidayDate, holiday_date, name } = req.body;
  const hDate = holidayDate || holiday_date;
  const reg = region || 'US';

  if (!hDate || !name) {
    return res.status(400).json({ error: 'Date and name are required for holiday' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO holidays (region, holiday_date, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (region, holiday_date) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, region, holiday_date::text as "holidayDate", name`,
      [reg, hDate, name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function bulkUpsertHolidays(req, res) {
  const { holidays } = req.body;
  if (!Array.isArray(holidays) || holidays.length === 0) {
    return res.status(400).json({ error: 'holidays must be a non-empty array' });
  }
  try {
    const inserted = [];
    for (const h of holidays) {
      const reg = (h.region || 'US').trim().toUpperCase();
      const hDate = h.holidayDate || h.holiday_date;
      const hName = h.name ? h.name.trim() : '';

      if (!reg || !hDate || !hName) continue;

      const result = await pool.query(
        `INSERT INTO holidays (region, holiday_date, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (region, holiday_date) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, region, holiday_date::text as "holidayDate", name`,
        [reg, hDate, hName]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json({ count: inserted.length, inserted: inserted.length, rows: inserted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteHoliday(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM holidays WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
