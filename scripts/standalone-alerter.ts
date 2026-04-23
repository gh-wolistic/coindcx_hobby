#!/usr/bin/env node
/**
 * Standalone Alerter Script
 * Run this independently from Next.js app for 24/7 monitoring
 * 
 * Usage:
 *   tsx scripts/standalone-alerter.ts [preset]
 *   
 *   preset: aggressive | balanced | strict (default: balanced)
 * 
 * Examples:
 *   tsx scripts/standalone-alerter.ts
 *   tsx scripts/standalone-alerter.ts aggressive
 *   tsx scripts/standalone-alerter.ts strict
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
config({ path: resolve(process.cwd(), '.env.local') });

import { CoinDCXAlerter, type AlertPreset } from '../src/lib/alerter';

// Get preset from command line argument or environment variable
const presetArg = process.argv[2] || process.env.ALERTER_PRESET || 'balanced';
const PRESET = presetArg as AlertPreset;

// Validate preset
const validPresets: AlertPreset[] = ['aggressive', 'balanced', 'strict'];
if (!validPresets.includes(PRESET)) {
  console.error(`❌ ERROR: Invalid preset "${PRESET}"`);
  console.error(`Valid presets: ${validPresets.join(', ')}`);
  process.exit(1);
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Validate configuration
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ ERROR: Missing Telegram configuration');
  console.error('Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local');
  process.exit(1);
}

// Create and start alerter
const alerter = new CoinDCXAlerter(PRESET);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  alerter.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  alerter.stop();
  process.exit(0);
});

// Start the alerter
console.log('═══════════════════════════════════════════════════════');
console.log('   CoinDCX Standalone Alerter');
console.log('═══════════════════════════════════════════════════════');
console.log('');

alerter.start();
