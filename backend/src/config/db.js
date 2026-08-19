'use strict';

const mongoose = require('mongoose');
const { config } = require('./env');

/**
 * Connects to MongoDB Atlas via Mongoose.
 *
 * Uses a single shared connection (Mongoose's default connection pool).
 * Mongoose handles reconnection automatically on transient failures.
 */
async function connectDB() {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`[DB] Connected to MongoDB: ${conn.connection.host}`);
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    // Exit — the API cannot serve useful responses without a database.
    // On Render, a crash here triggers an automatic restart.
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected');
  });
}

module.exports = { connectDB };
