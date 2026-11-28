// Reads the crash_reports table (docs/supabase-v12-crash-reports.sql) for the maintainer.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... node scripts/crashreports.mjs [--since 7d] [--limit 50] [--json]
//
// The service key is read from the environment only; it is never committed
// and never goes in the game (the game has the public key, which can only
// insert). Prints the newest first, one block per failure, or JSON with --json.
// Uses the REST endpoint directly, so it needs no packages (Node 18+).

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (the service role key, from the Supabase dashboard) in the environment.');
  process.exit(1);
}

const limit = Math.min(500, Math.max(1, Number(flag('--limit', '50')) || 50));
const since = String(flag('--since', ''));
const m = /^(\d+)([hd])$/.exec(since);
const query = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: String(limit) });
if (m) query.set('created_at', `gte.${new Date(Date.now() - Number(m[1]) * (m[2] === 'h' ? 3.6e6 : 8.64e7)).toISOString()}`);

const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/crash_reports?${query}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`Request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (!rows.length) {
  console.log('No crash reports.');
} else {
  for (const r of rows) {
    console.log(`${r.created_at} ${r.kind}${r.count > 1 ? ` x${r.count}` : ''} · ${r.message} (${r.file}${r.line ? `:${r.line}` : ''})`);
    console.log(`  place ${r.place || '?'} · build ${r.build || '?'} · ${r.tier || '?'} · couch ${r.couch ? 'yes' : 'no'} · room ${r.room ? 'yes' : 'no'} · id ${r.id}`);
    if (r.crumbs?.length) console.log(`  steps: ${r.crumbs.join(' > ')}`);
  }
}
