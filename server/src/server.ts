import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { createRouter } from './standalone/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes — mount on both /v1/* and /api/v1/*
const router = createRouter();
app.use('/v1', router);
app.use('/api/v1', router);

// Serve skill files (*.md, *.json) from frontend/public
const skillDir = resolve(__dirname, '../../frontend/public');
app.use(express.static(skillDir, { extensions: ['md', 'json'] }));

// Serve frontend dashboard from frontend/dist
const distDir = resolve(__dirname, '../../frontend/dist');
app.use(express.static(distDir));

// SPA fallback — serve index.html for unmatched routes (Express 5 syntax)
app.get('{*path}', (_req, res) => {
  res.sendFile(resolve(distDir, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Eyebalz Gateway running on port ${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/v1/system/health`);
  console.log(`  Dashboard: http://localhost:${PORT}/`);
  console.log(`  Skills:    http://localhost:${PORT}/skill.md`);
});
