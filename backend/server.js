import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import policyRoutes from './routes/policyRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import ragRoutes from './routes/ragRoutes.js';
import slackRoutes from './integrations/slack/routes/slackRoutes.js';
import { startJobScheduler } from './integrations/slack/services/slackJobScheduler.js';
import { initDbTables } from './db/pool.js';
import { initPolicyKnowledgeBase } from './services/policyRagService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);
app.use('/leave', leaveRoutes);
app.use('/holidays', holidayRoutes);
app.use('/policies', policyRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/reports', reportRoutes);

// RAG HR Policy Copilot routes
app.use('/api/rag', ragRoutes);
app.use('/rag', ragRoutes);

// Slack Integration routes
app.use('/api/slack', slackRoutes);
app.use('/slack', slackRoutes);

app.listen(port, async () => {
  console.log(`LeaveFlow Backend listening at http://localhost:${port}`);
  await initDbTables();
  await initPolicyKnowledgeBase();
  // Start persistent background job worker (30-second interval)
  startJobScheduler(30000);
});
