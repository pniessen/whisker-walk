// The home base tab set and a resolver that clamps any unknown/stale tab id
// back to the default. Pure — no DOM — so it's unit-tested; homebase.js
// imports it for the tab bar and for persisting the active tab across
// render() rebuilds.
export const HOME_TABS = ['play', 'social', 'album', 'settings'];

export function resolveTab(id) {
  return HOME_TABS.includes(id) ? id : 'play';
}
