// A stand-in for the public sources (job lists, company pages, the H-1B index) so the built program can be tested end to end
// without the internet.
/** JOBHUNT_FEED_SERVER, accepted only when it points at this computer: a local stand-in for the sources in end-to-end tests
 * of the built program (every address https://<host>/<path> is asked as <server>/<host>/<path>). Anything else is ignored. */
export function feedServerFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.JOBHUNT_FEED_SERVER;
  return s && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(s) ? s : null;
}
export const viaTestServer = (server: string, url: string) => {
  const u = new URL(url);
  return `${server}/${u.host}${u.pathname}${u.search}`;
};
