const VALID_CATEGORIES = ['games', 'movies', 'shows', 'music'];

async function ensureSchema(env) {
  try {
    const cols = await env.DB.prepare("PRAGMA table_info(items)").all();
    const colNames = (cols.results || []).map(c => c.name);
    if (colNames.includes('title') || (colNames.length > 0 && !colNames.includes('name'))) {
      await env.DB.prepare("DROP TABLE IF EXISTS items").run();
      await env.DB.prepare("DROP TABLE IF EXISTS votes").run();
      await env.DB.prepare("DROP TABLE IF EXISTS archives").run();
      colNames.length = 0;
    }
    if (colNames.length === 0) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, name TEXT NOT NULL, creator TEXT NOT NULL, cover TEXT, like_count INTEGER DEFAULT 0, neutral_count INTEGER DEFAULT 0, dislike_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))").run();
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS votes (person_id TEXT NOT NULL, item_id INTEGER NOT NULL, vote_type TEXT NOT NULL, voted_at TEXT NOT NULL, PRIMARY KEY (person_id, item_id))").run();
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_votes_item ON votes(item_id)").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_archives_category ON archives(category)").run();
    }
  } catch (e) {}
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    await ensureSchema(env);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    let match;

    if (method === 'GET' && (match = path.match(/^\/api\/items\/([a-z]+)$/))) {
      const category = match[1];
      if (!VALID_CATEGORIES.includes(category)) return json({ error: 'Invalid category' }, 400);
      const result = await env.DB.prepare('SELECT id, name, creator, cover, like_count, neutral_count, dislike_count, created_at FROM items WHERE category = ? ORDER BY (like_count - dislike_count) DESC, like_count DESC, created_at ASC').bind(category).all();
      return json({ items: result.results });
    }

    if (method === 'POST' && (match = path.match(/^\/api\/items\/([a-z]+)$/))) {
      const category = match[1];
      if (!VALID_CATEGORIES.includes(category)) return json({ error: 'Invalid category' }, 400);
      const { name, creator, cover } = await request.json();
      if (!name || !name.trim()) return json({ error: 'Name is required' }, 400);
      if (!creator || !creator.trim()) return json({ error: 'Creator is required' }, 400);
      const existing = await env.DB.prepare('SELECT id FROM items WHERE category = ? AND lower(name) = lower(?)').bind(category, name.trim()).first();
      if (existing) return json({ error: 'That item is already on the list.' }, 409);
      const result = await env.DB.prepare('INSERT INTO items (category, name, creator, cover, like_count, neutral_count, dislike_count) VALUES (?, ?, ?, ?, 0, 0, 0) RETURNING id').bind(category, name.trim(), creator.trim(), cover || null).first();
      return json({ id: result.id, name: name.trim(), creator: creator.trim(), cover: cover || null, like_count: 0, neutral_count: 0, dislike_count: 0 });
    }

    if (method === 'POST' && (match = path.match(/^\/api\/vote\/(\d+)$/))) {
      const itemId = parseInt(match[1]);
      const { person_id, vote_type } = await request.json();
      if (!person_id) return json({ error: 'Person ID required' }, 400);
      if (!['like', 'neutral', 'dislike'].includes(vote_type)) return json({ error: 'Invalid vote type' }, 400);
      const existingVote = await env.DB.prepare('SELECT vote_type, voted_at FROM votes WHERE person_id = ? AND item_id = ?').bind(person_id, itemId).first();
      const now = new Date();
      const nowISO = now.toISOString();
      if (existingVote) {
        const hoursSinceVote = (now - new Date(existingVote.voted_at)) / (1000 * 60 * 60);
        if (hoursSinceVote < 24) {
          const hoursLeft = Math.ceil(24 - hoursSinceVote);
          return json({ error: 'cooldown', hoursLeft, message: `Voting opens in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}` }, 429);
        }
        await env.DB.prepare('UPDATE votes SET vote_type = ?, voted_at = ? WHERE person_id = ? AND item_id = ?').bind(vote_type, nowISO, person_id, itemId).run();
      } else {
        await env.DB.prepare('INSERT INTO votes (person_id, item_id, vote_type, voted_at) VALUES (?, ?, ?, ?)').bind(person_id, itemId, vote_type, nowISO).run();
      }
      const countCol = vote_type === 'like' ? 'like_count' : vote_type === 'neutral' ? 'neutral_count' : 'dislike_count';
      await env.DB.prepare(`UPDATE items SET ${countCol} = ${countCol} + 1 WHERE id = ?`).bind(itemId).run();
      const item = await env.DB.prepare('SELECT like_count, neutral_count, dislike_count FROM items WHERE id = ?').bind(itemId).first();
      return json({ success: true, ...item });
    }

    if (method === 'GET' && (match = path.match(/^\/api\/archives\/([a-z]+)$/))) {
      const category = match[1];
      const result = await env.DB.prepare('SELECT id, category, data, created_at FROM archives WHERE category = ? ORDER BY created_at DESC').bind(category).all();
      return json({ archives: result.results });
    }

    if (method === 'POST' && (match = path.match(/^\/api\/archive\/([a-z]+)$/))) {
      const category = match[1];
      if (!VALID_CATEGORIES.includes(category)) return json({ error: 'Invalid category' }, 400);
      const result = await env.DB.prepare('SELECT id, name, creator, cover, like_count, neutral_count, dislike_count FROM items WHERE category = ? ORDER BY (like_count - dislike_count) DESC, like_count DESC, created_at ASC LIMIT 10').bind(category).all();
      if (result.results.length === 0) return json({ error: 'No items to archive' }, 400);
      const top10 = result.results.map((item, i) => ({ rank: i + 1, ...item, score: item.like_count - item.dislike_count }));
      const data = JSON.stringify({ items: top10 });
      const archive = await env.DB.prepare('INSERT INTO archives (category, data) VALUES (?, ?) RETURNING id, created_at').bind(category, data).first();
      return json({ id: archive.id, category, data, created_at: archive.created_at });
    }

    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    for (const category of VALID_CATEGORIES) {
      const result = await env.DB.prepare('SELECT id, name, creator, cover, like_count, neutral_count, dislike_count FROM items WHERE category = ? ORDER BY (like_count - dislike_count) DESC, like_count DESC, created_at ASC LIMIT 10').bind(category).all();
      if (result.results.length === 0) continue;
      const top10 = result.results.map((item, i) => ({ rank: i + 1, ...item, score: item.like_count - item.dislike_count }));
      await env.DB.prepare('INSERT INTO archives (category, data) VALUES (?, ?)').bind(category, JSON.stringify({ items: top10 })).run();
    }
    await env.DB.prepare('DELETE FROM votes').run();
    await env.DB.prepare('DELETE FROM items').run();
  },
};
