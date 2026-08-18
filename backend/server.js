import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import policyRoutes from './routes/policyRoutes.js';
import slackRoutes from './integrations/slack/routes/slackRoutes.js';
import { startJobScheduler } from './integrations/slack/services/slackJobScheduler.js';
import { initDbTables } from './db/pool.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);
app.use('/leave', leaveRoutes);
app.use('/holidays', holidayRoutes);
app.use('/policies', policyRoutes);

// Slack Integration routes
app.use('/api/slack', slackRoutes);
app.use('/slack', slackRoutes);

app.listen(port, async () => {
  console.log(`LMD Backend listening at http://localhost:${port}`);
  await initDbTables();
  // Start persistent background job worker (30-second interval)
  startJobScheduler(30000);
});

