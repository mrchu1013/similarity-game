// 마을회관 유사도 게임 — Gemini 임베딩 중계 (Cloudflare Worker)
// 설정: Worker의 Settings → Variables and Secrets 에 GEMINI_KEY (Secret) 추가
const ORIGINS = ['https://mrchu1013.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const MODEL = 'gemini-embedding-001';
const DIM = 768;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'GET') return json({ ok: true, key: !!env.GEMINI_KEY });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (origin && !ORIGINS.includes(origin)) return json({ error: 'origin' }, 403);
    if (!env.GEMINI_KEY) return json({ error: 'GEMINI_KEY not set' }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const texts = Array.isArray(body.texts) ? body.texts.map(t => String(t).trim().slice(0, 80)).filter(Boolean) : [];
    if (!texts.length || texts.length > 16) return json({ error: 'texts must be 1-16 items' }, 400);

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({
        requests: texts.map(text => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'SEMANTIC_SIMILARITY',
          outputDimensionality: DIM,
        })),
      }),
    });
    if (!r.ok) return json({ error: 'gemini ' + r.status, detail: (await r.text()).slice(0, 300) }, 502);
    const data = await r.json();
    // normalize (reduced dimensions are not unit length) and round to keep the payload small
    const vectors = data.embeddings.map(e => {
      const v = e.values; let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
      return v.map(x => Math.round(x / n * 1e5) / 1e5);
    });
    return json({ vectors });
  },
};
