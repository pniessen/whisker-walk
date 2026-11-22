// TV mode chunk: reached only through import('./tv/index.js') from main.js.
export async function start() {
  return { stop() {} };
}
