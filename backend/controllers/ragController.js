import { askPolicyCopilot, retrieveRelevantChunks } from '../services/policyRagService.js';
import { pool } from '../db/pool.js';

export async function askQuestion(req, res) {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const result = await askPolicyCopilot(question);
    res.json(result);
  } catch (err) {
    console.error('RAG Error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getAllPolicyHandbook(req, res) {
  try {
    const dbRes = await pool.query('SELECT id, category, section_title as "sectionTitle", chunk_text as "chunkText", keywords FROM policy_knowledge_chunks ORDER BY id ASC');
    res.json(dbRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
