addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const host = 'panelguys.top:8080';
  const username = '14263899';
  const password = '04468572';
  const streamId = '86765'; // Fijo tu canal; puedes hacerlo dinámico con ?stream=otro si quieres

  // URL base del stream (Xtream player/live.php format)
  let targetUrl = `http://${host}/live/${username}/${password}/${streamId}.ts`; // Para segmentos .ts directos
  let isPlaylist = false;

  // Si es request inicial (root o /playlist.m3u8), sirve el manifest
  if (url.pathname === '/' || url.pathname === '' || url.pathname.endsWith('.m3u8')) {
    targetUrl = `http://${host}/live/${username}/${password}/${streamId}.m3u8`;
    isPlaylist = true;
  } else if (url.pathname.endsWith('.ts') || url.pathname.endsWith('.key')) {
    // Segmentos ya vienen con path como /86765/chunklist_b123.ts o similar
    targetUrl = `http://${host}${url.pathname}`;
  }

  // Fetch al origen con headers realistas (evita detección de bot/proxy)
  let response = await fetch(targetUrl, {
    headers: {
      'User-Agent': request.headers.get('User-Agent') || 'Lavf/58.76.100', // Común en VLC/IPTV apps
      'Referer': `http://${host}/`,
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Accept-Encoding': 'identity', // No gzip para .ts binarios
    },
    redirect: 'manual',
  });

  // Si es m3u8 (playlist), reescribe segmentos y keys para apuntar al Worker
  const contentType = response.headers.get('content-type') || '';
  if (isPlaylist || contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl')) {
    let body = await response.text();

    // Rewrite típico Xtream: segmentos como media-123.ts o absolutos
    body = body.replace(
      /([^#].*?\.(ts|key|m3u8).*?)/gi,
      (match) => {
        if (match.startsWith('http')) {
          return match.replace(new RegExp(`^http://${host.replace(':', '\\:')}`), url.origin);
        }
        return url.origin + (match.startsWith('/') ? '' : '/') + match;
      }
    );

    // Corrige #EXT-X-KEY URIs
    body = body.replace(/URI="([^"]+)"/g, (m, p1) => {
      if (p1.startsWith('http')) {
        return `URI="${p1.replace(new RegExp(`^http://${host.replace(':', '\\:')}`), url.origin)}"`;
      }
      return `URI="${url.origin}/${p1.replace(/^\//, '')}"`;
    });

    response = new Response(body, response);
  }

  // Headers clave
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Cache-Control', 'no-cache, no-store');
  if (contentType) response.headers.set('Content-Type', contentType);

  return response;
}
