import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Live guard ("auto detect") sweep.
 *
 * Clients ping POST /heartbeat every `settings.heartbeatInterval` seconds while
 * the panel or the game is open, and every ping resets their miss streak. This
 * job walks the silent sessions and counts one miss per window longer than
 * `settings.heartbeatTimeout`; `settings.heartbeatLimit` misses in a row (3 by
 * default) fire the configured action, so leaving the panel or closing the game
 * is caught within a few sweeps.
 *
 * The 30s cadence matches the 30s default timeout, so a client that truly goes
 * away trips the limit in roughly a minute and a half.
 */
const crons = cronJobs();

crons.interval(
  "heartbeat sweep",
  { seconds: 30 },
  internal.nameserver.sweepHeartbeats,
  {},
);

export default crons;
