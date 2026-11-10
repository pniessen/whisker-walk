// Decisions for the refresh (ios/refresh.mjs), kept free of side
// effects so test/iosrefresh.test.js can pin them.

/**
 * Only `main`, as committed, in the main checkout reaches the children's
 * devices: never a feature branch, a worktree, or unsaved work.
 */
export function preflight({ branch, isWorktree, dirtyFiles }) {
  if (branch !== 'main') {
    return { ok: false, reason: `This builds what the family plays, so it only runs on main (you are on ${branch || 'no branch'}).` };
  }
  if (isWorktree) {
    return { ok: false, reason: 'Run this from the main checkout of the repo, not from a worktree.' };
  }
  if (dirtyFiles.length > 0) {
    return { ok: false, reason: `There are uncommitted changes (${dirtyFiles.length} file${dirtyFiles.length === 1 ? '' : 's'}). Commit or stash them first.` };
  }
  return { ok: true };
}

/**
 * Physical iPhones and iPads from `xcrun devicectl list devices --json-output`.
 * A device is reachable when it is plugged in or on the network: a Wi-Fi
 * device reports a transport type but has no tunnel until something talks to
 * it, so a closed tunnel alone does not mean out of range.
 */
export function parseDevices(json) {
  const devices = json?.result?.devices ?? [];
  return devices
    .filter((d) => d?.hardwareProperties?.reality === 'physical' && d?.hardwareProperties?.platform === 'iOS')
    .map((d) => {
      const conn = d.connectionProperties ?? {};
      return {
        udid: d.hardwareProperties.udid,
        name: d.deviceProperties?.name ?? d.hardwareProperties.marketingName ?? d.hardwareProperties.udid,
        model: d.hardwareProperties.marketingName ?? '',
        osVersion: d.deviceProperties?.osVersionNumber ?? '',
        reachable: conn.tunnelState === 'connected' || Boolean(conn.transportType),
      };
    });
}

/** True for a provisioning profile made for exactly this app on this team. */
export function profileMatches(profile, { teamId, bundleId }) {
  return profile?.Entitlements?.['application-identifier'] === `${teamId}.${bundleId}`;
}

/**
 * Register any new reachable device, then install on every registered,
 * reachable one. `register(udid)` returns `{ ok, profile, detail }` (the
 * profile after a build that registers that device); `install(udid)` returns
 * `{ ok, detail }`. A device that can't be set up (Developer Mode off, still
 * preparing, locked) fails on its own line: it never stops the others.
 */
export function refreshDevices({ devices, profile, register, install }) {
  let current = profile;
  const setupFailed = new Map();
  for (const d of devices) {
    if (!d.reachable || current.ProvisionedDevices.includes(d.udid)) continue;
    const r = register(d.udid);
    if (r.ok) current = r.profile;
    else setupFailed.set(d.udid, r.detail || 'unknown error');
  }
  const results = devices.map((d) => {
    const base = { name: d.name, udid: d.udid };
    if (setupFailed.has(d.udid)) return { ...base, status: 'failed', detail: `couldn't set it up: ${setupFailed.get(d.udid)}` };
    if (!current.ProvisionedDevices.includes(d.udid)) return { ...base, status: 'unregistered' };
    if (!d.reachable) return { ...base, status: 'skipped' };
    const r = install(d.udid);
    return r.ok ? { ...base, status: 'installed' } : { ...base, status: 'failed', detail: r.detail || 'unknown error' };
  });
  return { results, profile: current };
}

/** The new expiry for each device installed this run; others keep theirs. */
export function updateHistory(history, results, expiry) {
  const next = { ...history };
  for (const r of results) if (r.status === 'installed' && r.udid) next[r.udid] = expiry.toISOString();
  return next;
}

const DAY = 24 * 60 * 60 * 1000;
export const day = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const LINE = {
  installed: () => '✓ installed',
  skipped: (r, earlier) => `– skipped (${r.detail || 'asleep, locked or out of range'}); ${
    earlier ? `its app stops opening ${day(earlier)}` : 'it keeps its earlier expiry date'}`,
  unregistered: () => '– not set up yet: see ios/README.md',
  failed: (r) => `✗ failed: ${r.detail || 'unknown error'}`,
};

/**
 * What to tell the owner, and the exit code: 1 if nothing was installed or
 * any install failed, else 0. A device that was simply asleep or away is not
 * a failure, but its own expiry (from `history`, udid → ISO date of its last
 * install) is shown, with a warning when it is under 2 days away.
 */
export function summarize(results, expiry, now, history = {}) {
  const earlierOf = (r) => (r.udid && history[r.udid] ? new Date(history[r.udid]) : null);
  const lines = results.map((r) => `${r.name}: ${LINE[r.status](r, earlierOf(r))}`);
  const installed = results.some((r) => r.status === 'installed');
  if (installed) {
    lines.push(`New installs expire ${day(expiry)}. Refresh again by ${day(new Date(expiry.getTime() - DAY))}.`);
    if (expiry.getTime() - now.getTime() < 6 * DAY) {
      lines.push('Warning: this install expires in under 6 days, so the signing profile was not renewed. Run the refresh again.');
    }
  } else {
    lines.push('Nothing was installed.');
  }
  for (const r of results) {
    const earlier = r.status === 'skipped' ? earlierOf(r) : null;
    if (earlier && earlier.getTime() - now.getTime() < 2 * DAY) {
      lines.push(`Warning: ${r.name}'s app stops opening ${day(earlier)}. Wake it, unlock it and run the refresh again.`);
    }
  }
  const failed = results.some((r) => r.status === 'failed');
  return { lines, exitCode: installed && !failed ? 0 : 1 };
}
