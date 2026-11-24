/**
 * The image's HEALTHCHECK (see Dockerfile): exits 0 when GET /health answers
 * 2xx within 2 seconds, 1 otherwise (the API is down, hangs, or can't reach
 * the database). A plain script, not curl: the Alpine image has none, and
 * this loads nothing of the app.
 */
const port = process.env.PORT ?? '1339';

fetch(`http://127.0.0.1:${port}/health`, {
  signal: AbortSignal.timeout(2000),
})
  .then((response) => {
    process.exitCode = response.ok ? 0 : 1;
  })
  .catch(() => {
    process.exitCode = 1;
  });
