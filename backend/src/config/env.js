'use strict';

/**
 * Centralised environment configuration.
 *
 * Called once at startup (before the DB connects and before any routes load).
 * Throws immediately if a required variable is missing — fail-fast is safer
 * than discovering a missing API key during a live ingestion run.
 */

require('dotenv').config();

const REQUIRED = [
  'MONGODB_URI',
  'JWT_SECRET',
];

function validateEnv() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in the missing values.'
    );
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || '',
    appKey: process.env.ADZUNA_APP_KEY || '',
    country: process.env.ADZUNA_COUNTRY || 'gb',
    query: process.env.ADZUNA_QUERY || 'software engineer',
  },
  remoteok: {
    tags: (process.env.REMOTEOK_TAGS || 'dev,backend').split(',').map(t => t.trim()),
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  ingestionSecret: process.env.INGESTION_SECRET || '',
};

module.exports = { config, validateEnv };
