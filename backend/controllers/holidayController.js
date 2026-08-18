import { pool } from '../db/pool.js';

export async function getHolidays(req, res) {
  const { region } = req.query;
  try {
    const query = region
      ? 'SELECT id, region, holiday_date as "holidayDate", name FROM holidays WHERE region = $1 ORDER BY holiday_date ASC'
      : 'SELECT id, region, holiday_date as "holidayDate", name FROM holidays ORDER BY region, holiday_date ASC';
    const result = region
      ? await pool.query(query, [region])
      : await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function bulkUpsertHolidays(req, res) {
  const { holidays } = req.body;
  if (!Array.isArray(holidays) || holidays.length === 0) {
    return res.status(400).json({ error: 'holidays must be a non-empty array' });
  }
  try {
    const inserted = [];
    for (const { region, holiday_date, name } of holidays) {
      if (!region || !holiday_date || !name) continue;
      const result = await pool.query(
        `INSERT INTO holidays (region, holiday_date, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (region, holiday_date) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, region, holiday_date as "holidayDate", name`,
        [region, holiday_date, name]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json({ inserted: inserted.length, rows: inserted });
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
