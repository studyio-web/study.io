/**
 * study.io — Authoritative Timer & Session Configuration Constants
 * 
 * Central source of truth for session limits, timeouts, intervals and thresholds.
 */

/** Duration after which an unconfirmed stopwatch session triggers the "Still studying?" prompt */
export const STILL_STUDYING_AFTER_HOURS = 12;

/** Grace window in minutes for the user to confirm they are still studying before auto-closing */
export const CONFIRM_WINDOW_MINUTES = 30;

/** Absolute maximum study time allowed for any single continuous session (24 hours) */
export const ABSOLUTE_MAX_SESSION_HOURS = 24;

/** Inactivity duration after which a paused session automatically auto-closes */
export const PAUSED_SESSION_AUTO_CLOSE_HOURS = 24;

/** Background poll interval in seconds for visible inactive tabs/windows */
export const POLL_INTERVAL_VISIBLE_SECONDS = 60;

/** Minimum duration in seconds required for a session to earn RP and XP */
export const MIN_DURATION_FOR_RP_SECONDS = 60;

/** Rate of RP per hour of valid focus time */
export const RP_PER_HOUR = 100;

/** Divisor to calculate RP from focus seconds: floor(seconds / 36) */
export const RP_DIVISOR = 36;
