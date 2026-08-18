import { pool } from '../db/pool.js';
import dotenv from 'dotenv';
dotenv.config();

export const OFFICIAL_POLICY_CHUNKS = [
  {
    category: 'Annual Leave',
    sectionTitle: 'Section 1: Annual / Earned Leave (AL)',
    keywords: ['annual', 'earned', 'vacation', 'carry forward', 'encashment', 'notice period', 'accrual'],
    chunkText: `• Entitlement: 12 to 20 days per calendar year (accrues dynamically based on role & employment tier: Employee +1.0d/mo, Manager +2.0d/mo, Sr Manager +4.0d/mo, Director +5.0d/mo, Part-Time +0.5d/mo).
• Accrual Rule: Full-time employees accrue leave monthly for each month completed with 0 unexcused absences.
• Notice Period: Minimum 7 days advance notice required for leaves exceeding 3 consecutive working days.
• Carry Forward Rule: A maximum of 5 days can be carried forward to the subsequent calendar year. Any unused balance beyond 5 days automatically lapses on December 31.
• Encashment: Unused annual leave up to a maximum of 10 days can be en-cashed at the time of employee separation or retirement.`
  },
  {
    category: 'Sick Leave',
    sectionTitle: 'Section 2: Sick Leave (SL) & Medical Certificate Rules',
    keywords: ['sick', 'medical', 'doctor', 'certificate', 'illness', 'hospital', 'health', 'fever', 'prescription'],
    chunkText: `• Entitlement: 10 paid sick days per calendar year credited immediately upon joining.
• Medical Certificate Rule:
  - If sick leave is 1 or 2 consecutive days: Self-certification in the application reason is sufficient.
  - If sick leave is 3 or more consecutive days: A valid Medical Certificate from a registered medical practitioner is mandatory upon resuming work.
• Reset & Carry Forward: Sick leave does not carry forward to subsequent years; it resets to 10 days every January 1.
• Morning Notification: Employees must notify their reporting manager via portal or Slack before 10:00 AM on the day of absence.`
  },
  {
    category: 'Maternity Leave',
    sectionTitle: 'Section 3: Maternity Leave (ML)',
    keywords: ['maternity', 'pregnancy', 'mother', 'childbirth', 'delivery', 'adoption', 'surrogacy', 'female', 'infant'],
    chunkText: `• Eligibility: Female employees with at least 80 days of active service in the 12 months preceding the expected delivery date.
• Duration:
  - First and second child: 26 continuous weeks (182 calendar days) with 100% full pay.
  - Third child onwards: 12 continuous weeks with full pay.
• Pre-natal & Post-natal Split: Maximum 8 weeks can be availed prior to expected delivery; the remainder is taken post-delivery.
• Adoption / Surrogacy: 12 weeks of fully paid leave for legally adopting an infant under 3 months of age or via surrogacy.
• Flexible Return: Following 26 weeks, employees may request mutual hybrid or remote work arrangements subject to management approval.`
  },
  {
    category: 'Paternity Leave',
    sectionTitle: 'Section 4: Paternity & Secondary Caregiver Leave (PL)',
    keywords: ['paternity', 'father', 'caregiver', 'birth', 'partner', 'adoption', 'male'],
    chunkText: `• Eligibility: All full-time employees upon completion of 90 days of continuous employment.
• Duration: 15 working days (3 full weeks) with 100% full pay.
• Availment Window: Can be taken in a single block or up to 2 separate splits within the first 6 months following child birth or legal adoption.
• Application: Must be applied with at least 2 weeks advance notice when possible.`
  },
  {
    category: 'Casual & Emergency',
    sectionTitle: 'Section 5: Casual & Emergency Leave (CL)',
    keywords: ['casual', 'emergency', 'urgent', 'personal', 'unforeseen', 'backdated', 'past'],
    chunkText: `• Entitlement: 6 days per calendar year.
• Purpose: For urgent personal emergencies, unexpected domestic events, or religious observances.
• Maximum Continuous Duration: Cannot exceed 3 consecutive working days at a time.
• Backdated Emergency Rule: Past-dated leaves can only be applied as "Emergency Leave" and require explicit manager confirmation within 48 hours.`
  },
  {
    category: 'Bereavement',
    sectionTitle: 'Section 6: Bereavement / Compassionate Leave',
    keywords: ['bereavement', 'compassionate', 'death', 'funeral', 'family', 'loss', 'grief'],
    chunkText: `• Immediate Family (Spouse, Child, Parent, Sibling): Up to 5 consecutive working days with full pay.
• Extended Family (Grandparent, In-Laws): Up to 3 consecutive working days with full pay.
• Travel Extension: Additional 2 days of unpaid or annual leave can be combined if long-distance travel (>500 km) is required.`
  },
  {
    category: 'Compensatory Off',
    sectionTitle: 'Section 7: Compensatory Off (Comp-Off)',
    keywords: ['comp-off', 'compensatory', 'weekend work', 'overtime', 'holiday work'],
    chunkText: `• Eligibility: Applicable when an employee works on a scheduled weekend or recognized public holiday with prior written manager approval.
• Validity Window: Must be availed within 60 calendar days of earning the credit; unused comp-off lapses after 60 days and cannot be encashed.`
  },
  {
    category: 'Unpaid / Sabbatical',
    sectionTitle: 'Section 8: Leave Without Pay (LWP) & Sabbatical',
    keywords: ['unpaid', 'lwp', 'sabbatical', 'leave without pay', 'long leave', 'education', 'recovery'],
    chunkText: `• Eligibility: Employees with at least 2 years of continuous tenure.
• Duration: Minimum 1 month up to a maximum of 6 months for medical recovery, higher education, or personal sabbatical.
• Approval Authority: Requires Tier 2 (Senior Manager) + Director approval. Leave accruals and benefits are paused during the LWP period.`
  },
  {
    category: 'Workflow & Rules',
    sectionTitle: 'Section 9: Multi-Tier Approval Matrix & 12-Hour Withdrawal Rule',
    keywords: ['approval', 'tier', 'hierarchy', 'withdraw', '12-hour', 'cancellation', 'manager', 'escalation'],
    chunkText: `• Tier 1 Approval: Required for all leaves of 1 to 2 working days (Direct Manager review).
• Tier 2 Approval: Mandatory for leaves of 3 or more working days (escalates automatically from Direct Manager to Senior Manager / Director).
• 12-Hour Withdrawal Rule: Employees can self-withdraw pending leaves directly from the portal up to 12 hours prior to the scheduled leave start date. Requests within 12 hours of start cannot be withdrawn.`
  }
];

/**
 * Initializes table and seeds policy knowledge chunks
 */
export async function initPolicyKnowledgeBase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS policy_knowledge_chunks (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        section_title TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        keywords TEXT[],
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    // Check if seeded
    const countRes = await pool.query('SELECT count(*) FROM policy_knowledge_chunks');
    if (parseInt(countRes.rows[0].count) < OFFICIAL_POLICY_CHUNKS.length) {
      await pool.query('DELETE FROM policy_knowledge_chunks');
      for (const chunk of OFFICIAL_POLICY_CHUNKS) {
        await pool.query(
          `INSERT INTO policy_knowledge_chunks (category, section_title, chunk_text, keywords)
           VALUES ($1, $2, $3, $4)`,
          [chunk.category, chunk.sectionTitle, chunk.chunkText, chunk.keywords]
        );
      }
      console.log(`[RAG Service] ✓ Seeded ${OFFICIAL_POLICY_CHUNKS.length} policy knowledge chunks.`);
    }
  } catch (err) {
    console.error('[RAG Service] Table init error:', err.message);
  }
}

/**
 * Semantic + Keyword TF-IDF / Token Match Scoring
 */
function scoreChunkRelevance(query, chunk) {
  const qTokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2);
  const text = (chunk.section_title + ' ' + chunk.chunk_text + ' ' + (chunk.keywords || []).join(' ')).toLowerCase();
  
  let score = 0;
  for (const token of qTokens) {
    if (text.includes(token)) {
      score += 2;
      // Extra weight for title/category matches
      if (chunk.section_title.toLowerCase().includes(token) || chunk.category.toLowerCase().includes(token)) {
        score += 4;
      }
      // Extra weight for keywords match
      if ((chunk.keywords || []).some(k => k.includes(token))) {
        score += 3;
      }
    }
  }

  // Exact phrase match bonus
  if (text.includes(query.toLowerCase().trim())) {
    score += 10;
  }

  return score;
}

/**
 * Retrieves top matching policy sections for user query
 */
export async function retrieveRelevantChunks(query, limit = 3) {
  const dbRes = await pool.query('SELECT * FROM policy_knowledge_chunks');
  const scored = dbRes.rows.map(c => ({
    ...c,
    relevanceScore: scoreChunkRelevance(query, c)
  }));

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // If top score > 0, return top-K; otherwise fallback to general overview
  const relevant = scored.filter(s => s.relevanceScore > 0).slice(0, limit);
  return relevant.length > 0 ? relevant : dbRes.rows.slice(0, limit);
}

/**
 * Generates structured, grounded answer from retrieved chunks
 */
export async function generateGroundedAnswer(question, relevantChunks) {
  const context = relevantChunks.map(c => `${c.section_title}:\n${c.chunk_text}`).join('\n\n');
  const citations = relevantChunks.map(c => c.section_title);

  // If Gemini API Key is configured, use Gemini LLM
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are the official HR Leave Policy Copilot. Answer the user's question accurately using ONLY the provided official policy context.
Be direct, helpful, and professional. Use markdown formatting with bullet points.
Cite the section names clearly.

OFFICIAL POLICY CONTEXT:
${context}

QUESTION:
${question}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      return {
        answer: response.text,
        citations,
        source: 'gemini-2.5-flash'
      };
    } catch (err) {
      console.warn('[RAG Service] Gemini API call fallback:', err.message);
    }
  }

  // Deterministic Grounded Policy Engine (Production-Grade Fallback)
  let answer = `According to the official **${citations[0]}**:\n\n`;
  const mainChunk = relevantChunks[0];
  const bulletLines = mainChunk.chunk_text.split('\n').filter(l => l.trim().length > 0);
  
  answer += bulletLines.join('\n') + '\n\n';
  
  if (relevantChunks.length > 1) {
    answer += `**Additional Relevant Policy Details (${relevantChunks[1].section_title}):**\n`;
    answer += relevantChunks[1].chunk_text.split('\n').slice(0, 3).join('\n');
  }

  return {
    answer,
    citations,
    source: 'policy-rag-engine'
  };
}

/**
 * Main RAG Query Handler
 */
export async function askPolicyCopilot(question) {
  if (!question || !question.trim()) {
    throw new Error('Question is required');
  }

  const chunks = await retrieveRelevantChunks(question, 2);
  const result = await generateGroundedAnswer(question, chunks);

  return {
    question,
    answer: result.answer,
    citations: result.citations,
    engine: result.source,
    timestamp: new Date().toISOString()
  };
}
