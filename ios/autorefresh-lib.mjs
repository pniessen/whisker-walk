// Decisions for the nightly refresh (ios/refresh.mjs --auto), kept free of
// side effects so test/iosautorefresh.test.js can pin them.

import { day } from './refresh-lib.mjs';

const DAY = 24 * 60 * 60 * 1000;
/** A device is renewed in its last RENEW_DAYS days. */
export const RENEW_DAYS = 3;
/** With more than WAIT_DAYS left, an open game is left alone until another night. */
const WAIT_DAYS = 1;
/** A due device still away in its last ALERT_DAYS days gets an alert. */
const ALERT_DAYS = 2;

/**
 * Tonight's plan for every device the refresh has installed on before
 * (`history`: udid → ISO expiry of its last install) plus any other device
 * the Mac lists. Actions:
 *   fine     more than 3 days left: not touched
 *   renew    due and reachable: install tonight
 *   waiting  due, but the game is open and more than a day is left
 *   away     due, but asleep, locked or out of range
 *   new      never set up by the refresh: needs the cable and `npm run ios:refresh`
 */
export function planNight({ devices, history, playing, now }) {
  const listed = new Map(devices.map((d) => [d.udid, d]));
  const udids = [...new Set([...Object.keys(history), ...devices.map((d) => d.udid)])];
  const planned = udids.map((udid) => {
    const d = listed.get(udid);
    const name = d?.name ?? udid;
    if (!history[udid]) return { udid, name, action: 'new' };
    const expiry = new Date(history[udid]);
    const daysLeft = (expiry.getTime() - now.getTime()) / DAY;
    let action;
    if (daysLeft > RENEW_DAYS) action = 'fine';
    else if (!d?.reachable) action = 'away';
    else if (playing.has(udid) && daysLeft > WAIT_DAYS) action = 'waiting';
    else action = 'renew';
    return { udid, name, action, expiry, daysLeft };
  });
  return { devices: planned, toRenew: planned.filter((d) => d.action === 'renew').map((d) => d.udid) };
}

/** Each device's latest install result, in the order devices first appeared. */
export function latestResults(results) {
  const byDevice = new Map();
  for (const r of results) byDevice.set(r.udid, r);
  return [...byDevice.values()];
}

/** Due devices not yet installed tonight: worth another try later in the evening. */
export function stillPending(plan, results) {
  const installed = new Set(latestResults(results).filter((r) => r.status === 'installed').map((r) => r.udid));
  return plan.devices
    .filter((d) => ['renew', 'waiting', 'away'].includes(d.action) && !installed.has(d.udid))
    .map((d) => d.udid);
}

/** True when Whisker Walk is open (or paused in the background) on the device. */
export function isGameRunning(processesJson) {
  const procs = processesJson?.result?.runningProcesses ?? [];
  return procs.some((p) => /\/WhiskerWalk\.app\/WhiskerWalk$/.test(p?.executable ?? ''));
}

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * The Mac notification for tonight, or null when there is nothing to say.
 * `build` is null when nothing was due, else { kind: 'fresh' | 'fallback' |
 * 'failed', reason }. `urgent` notifications play an alert sound.
 */
export function nightNotice({ plan, results, expiry, build, now }) {
  const parts = [];
  let urgent = false;

  const installed = results.filter((r) => r.status === 'installed').map((r) => r.name);
  // A failed install (often just a locked iPad) is retried tomorrow; it is
  // worth an alert only in the device's last 2 days.
  const daysLeft = new Map(plan.devices.map((d) => [d.udid, d.daysLeft]));
  const failed = results.filter((r) => r.status === 'failed' && !(daysLeft.get(r.udid) > ALERT_DAYS));

  if (build?.kind === 'failed') {
    urgent = true;
    parts.push(`Couldn't renew Whisker Walk: ${build.reason}. Run npm run ios:refresh in cat-game.`);
  }
  if (installed.length > 0) {
    parts.push(`Renewed ${list(installed)}, good until ${day(expiry)}.`);
    if (expiry.getTime() - now.getTime() < 6 * DAY) {
      urgent = true;
      parts.push('But the 7-day signing was not renewed: run npm run ios:refresh in cat-game.');
    }
    if (build?.kind === 'fallback') {
      urgent = true;
      parts.push(`Not updated: ${build.reason}, so the last good version went on instead.`);
    }
  }
  for (const r of failed) {
    urgent = true;
    parts.push(`${r.name} failed: ${r.detail || 'unknown error'}.`);
  }
  for (const d of plan.devices) {
    if (d.action === 'away' && d.daysLeft <= ALERT_DAYS) {
      urgent = true;
      parts.push(`${d.name} hasn't been reachable; its app stops opening ${day(d.expiry)}. Wake it, unlock it and keep it on home Wi-Fi.`);
    }
  }

  if (parts.length === 0) return null;
  return { title: urgent ? 'Whisker Walk needs you' : 'Whisker Walk', message: parts.join(' '), urgent };
}

const appleString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** The AppleScript (for `osascript -e`) that shows a notice. */
export function notifyScript({ title, message, urgent }) {
  return `display notification ${appleString(message)} with title ${appleString(title)}${urgent ? ' sound name "Basso"' : ''}`;
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The launchd agent that runs the nightly refresh. */
export function launchAgentPlist({ label, node, repo, log, path, hour, minute, args = ['--auto'] }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(`${repo}/ios/refresh.mjs`)}</string>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(repo)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(path)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;
}
