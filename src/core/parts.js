/* Build 36 — replies in parts, read as one.
 *
 * Tejas, 26-11-2026: the Sector Finder's reply comes back so small that it
 * took 12 to 15 follow-ups to reach 80%, and he asked whether the replies
 * could come in parts and still end as one or two JSON to import. A chat
 * reply has a length limit, so asking the tool to join the parts at the end
 * only makes one reply that is cut off. The app joins them instead: each
 * prompt asks for numbered parts (or one downloadable file where the tool
 * can make one), and the app reads every block it is given, in a paste, a
 * file or several pastes, and joins them before anything is saved.
 *
 * No imports: completeness.js and finder.js both use this module. */

/* Every JSON object in a paste or a file, in order: fenced blocks,
   marker-wrapped blocks and bare objects, with prose between them. A brace
   inside a string does not count. */
export function extractBlocks(text) {
  const t = String(text || '');
  const out = [];
  let i = 0;
  while (i < t.length) {
    const start = t.indexOf('{', i);
    if (start < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let k = start; k < t.length; k++) {
      const ch = t[k];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) break;
    let obj = null;
    try { obj = JSON.parse(t.slice(start, end + 1)); } catch (e) { obj = null; }
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && (obj.schema || obj.run || obj.sectors || obj.companies)) { out.push(obj); i = end + 1; }
    else i = start + 1;
  }
  return out;
}

/* How many code blocks a paste appears to hold, to warn when one of them
   could not be read (most often, cut off). */
export function blockMarks(text) {
  const t = String(text || '');
  const fences = (t.match(/```/g) || []).length / 2;
  const markers = (t.match(/<<<EQUITY-ANALYST-DATA/g) || []).length;
  return Math.max(Math.floor(fences), markers);
}

/* A part's label: run.part { n, of, id }. Numbers as text are read. */
export function partOf(obj) {
  const p = obj && obj.run && obj.run.part;
  if (!p || typeof p !== 'object') return null;
  const n = parseInt(p.n, 10), of = parseInt(p.of, 10);
  if (!(n >= 1) || !(of >= 1) || n > of) return null;
  return { n, of, id: String(p.id || '').trim() || 'parts' };
}

/* The instruction every Finder prompt ends with. `plan` lists what each
   part carries; `id` names the set. */
export function partsRule({ id, plan, what = 'the JSON' }) {
  const n = plan.length;
  return `HOW TO SEND IT — IN ${n} PART${n === 1 ? '' : 'S'}

A reply has a length limit, so ${what} is sent in ${n} part${n === 1 ? '' : 's'}, one per reply:
${plan.map((p, i) => `  Part ${i + 1}: ${p}`).join('\n')}

  1. Send Part 1 now. After each part, STOP and wait. When I write "next",
     send the next part. Never repeat a part already sent.
  2. Each part is ONE fenced code block tagged json, minified on ONE LINE,
     complete JSON on its own, "schema" first, with this in "run":
       "part": { "n": 1, "of": ${n}, "id": "${id}" }
     (n is the part's number; "of" and "id" stay the same in every part).
  3. If a part would be too long, send what fits, end the block cleanly, and
     number the rest on: raise "of" by one in this and every later part. The
     application reads any number of parts.
  4. Keep it short, so more fits in each part: "source" names the site and
     date in a few words; a searchLog "reason" is one sentence; leave out any
     key you have no value for — never send 0, "" or null in its place.
  5. IF YOU CAN CREATE A DOWNLOADABLE FILE (a code or file tool), do that
     instead: put ALL of it, every part together, in ONE file named
     ${id}.json, as one JSON object in the same form, and say so. No parts
     are needed then; it is read with "Import file".

The application joins the parts itself, in any order, whether they are
pasted one at a time or all together.`;
}

/* Sectors split into parts of `size`, in list order. */
export function planSectors(names, size, firstExtra = '') {
  const out = [];
  for (let i = 0; i < names.length; i += size) {
    const chunk = names.slice(i, i + size);
    out.push(`sectors ${i + 1}–${i + chunk.length} (${chunk.join(', ')})${i === 0 && firstExtra ? ', and ' + firstExtra : ''}`);
  }
  return out;
}

export const partId = (kind, now = new Date()) => {
  const z = (v) => (v < 10 ? '0' : '') + v;
  return `${kind}-${z(now.getDate())}${z(now.getMonth() + 1)}${now.getFullYear()}-${z(now.getHours())}${z(now.getMinutes())}`;
};
