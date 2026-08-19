'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { config } = require('./src/config/env');
const { errorHandler } = require('./src/middleware/errorHandler');

// Route modules
const authRoutes = require('./src/routes/auth');
const jobRoutes = require('./src/routes/jobs');
const skillRoutes = require('./src/routes/skills');
const userRoutes = require('./src/routes/users');
const analyticsRoutes = require('./src/routes/analytics');
const adminRoutes = require('./src/routes/admin');

const app = express();

// ── Security middleware ────────────────────────────────────────────────────────
// helmet sets sensible HTTP security headers (XSS protection, HSTS, etc.)
app.use(helmet());

// CORS — allow only the configured frontend origin in production
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? config.frontendUrl
    : true, // allow all origins in development
  credentials: true,
}));

// ── Request parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // limit request body size
app.use(express.urlencoded({ extended: true }));

// ── Request logging ────────────────────────────────────────────────────────────
// 'dev' format in development, 'combined' (more detail) in production
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ── Health check ───────────────────────────────────────────────────────────────
// Used by Render to verify the service is alive; also a quick sanity check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.nodeEnv });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found.`,
    },
  });
});

// ── Centralized Error Handler ─────────────────────────────────────────────────
// Must be the last middleware registered — Express identifies error handlers
// by their 4-argument signature (err, req, res, next).
app.use(errorHandler);

module.exports = app;
