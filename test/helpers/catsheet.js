// The My cat sheet is a lazy chunk (src/ui/catlogin.js): homebase draws a placeholder until it
// has arrived. Tests import the chunk first (so it is cached) and then wait for the sheet to be
// drawn: microtasks only, so fake timers stay where the test put them.
export async function sheetDrawn(html) {
  for (let i = 0; i < 400 && html().includes('sync-loading'); i++) await Promise.resolve();
}
