/**
 * Cloudflare Worker: Strava webhook -> GitHub repository_dispatch
 *
 * Strava pushes an event whenever a new activity is created on the
 * athlete's account. Garmin Connect (Global) already pushes every
 * activity to Strava automatically, so this worker uses that Strava
 * event purely as a low-latency "doorbell" to trigger the existing
 * Garmin Global -> Garmin CN sync workflow. No Strava activity data
 * is ever read or stored here.
 *
 * Auth model: there is no per-request signature from Strava, so the
 * webhook path itself doubles as a shared secret (WEBHOOK_PATH). Any
 * request to a different path is rejected before touching the body.
 */

const GITHUB_API_VERSION = '2022-11-28';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== `/hook/${env.WEBHOOK_PATH}`) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'GET') {
      return handleValidation(url, env);
    }

    if (request.method === 'POST') {
      return handleEvent(request, env, ctx);
    }

    return new Response('Method not allowed', { status: 405 });
  },
};

/**
 * Strava subscription validation handshake.
 * https://developers.strava.com/docs/webhooks/
 * Must respond within 2 seconds by echoing hub.challenge as JSON.
 */
function handleValidation(url, env) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || token !== env.STRAVA_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Strava event delivery.
 * Must always ack with 200 within 2 seconds or Strava will retry (up to
 * 3 times) and may eventually disable the subscription. We therefore
 * never await the outbound GitHub call on the response path — it runs
 * in the background via ctx.waitUntil after we've already replied.
 */
async function handleEvent(request, env, ctx) {
  let event;
  try {
    event = await request.json();
  } catch {
    // Malformed body: ack anyway, nothing to retry for.
    return new Response('ok', { status: 200 });
  }

  const isNewGarminActivity =
    event.object_type === 'activity' &&
    event.aspect_type === 'create' &&
    String(event.owner_id) === env.STRAVA_OWNER_ID;

  if (isNewGarminActivity) {
    ctx.waitUntil(fireDispatch(env, event));
  }
  // Updates, deletes, athlete events, and events from other owners are
  // all acknowledged the same way — just no action taken.

  return new Response('ok', { status: 200 });
}

async function fireDispatch(env, event) {
  const body = JSON.stringify({
    event_type: 'new_activity',
    client_payload: {
      strava_activity_id: event.object_id,
      owner_id: event.owner_id,
      event_time: event.event_time,
      source: 'strava-webhook',
    },
  });

  const attempt = () =>
    fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        // GitHub's API rejects requests with no User-Agent.
        'User-Agent': 'garmin-sync-trigger-worker',
        'Content-Type': 'application/json',
      },
      body,
    });

  let resp = await attempt();
  if (resp.status !== 204) {
    console.error(
      `dispatch failed (attempt 1): ${resp.status} ${await resp.text()}`
    );
    // One retry after a short delay, then give up — the daily safety
    // net schedule will pick up anything that still gets missed.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    resp = await attempt();
    if (resp.status !== 204) {
      console.error(
        `dispatch failed (attempt 2): ${resp.status} ${await resp.text()}`
      );
    }
  }
}
