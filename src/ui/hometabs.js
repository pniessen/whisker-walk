// The home base tab set and a resolver that clamps any unknown/stale tab id
// back to the default. Pure — no DOM — so it's unit-tested; homebase.js
// imports it for the tab bar and for persisting the active tab across
// render() rebuilds. A stale persisted 'play' id (the tab's pre-rename name)
// clamps to 'cats' via the same unknown-id fallback.
export const HOME_TABS = ['cats', 'accessories', 'social', 'album', 'settings'];

export function resolveTab(id) {
  return HOME_TABS.includes(id) ? id : 'cats';
}
