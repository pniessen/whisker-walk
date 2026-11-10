// Decisions for the weekly refresh (ios/refresh.mjs), kept free of side
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

const DAY = 24 * 60 * 60 * 1000;
const day = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const LINE = {
  installed: () => '✓ installed',
  skipped: (r) => `– skipped (${r.detail || 'asleep, locked or out of range'})`,
  unregistered: () => '– not set up yet: see ios/README.md',
  failed: (r) => `✗ failed: ${r.detail || 'unknown error'}`,
};

/**
 * What to tell the owner, and the exit code: 1 if nothing was installed or
 * any install failed, else 0. A device that was simply asleep or away is not
 * a failure.
 */
export function summarize(results, expiry, now) {
  const lines = results.map((r) => `${r.name}: ${LINE[r.status](r)}`);
  const installed = results.some((r) => r.status === 'installed');
  if (installed) {
    lines.push(`Expires ${day(expiry)}. Refresh again by ${day(new Date(expiry.getTime() - DAY))}.`);
    if (expiry.getTime() - now.getTime() < 6 * DAY) {
      lines.push('Warning: this install expires in under 6 days, so the signing profile was not renewed. Run the refresh again.');
    }
  } else {
    lines.push('Nothing was installed.');
  }
  const failed = results.some((r) => r.status === 'failed');
  return { lines, exitCode: installed && !failed ? 0 : 1 };
}
