// Stage 2 of ingestion: turn raw dblegends.net data into the normalized schema
// used by the engine (see src/data/types.ts). Anything that can't be parsed with
// confidence is kept as text and flagged, never guessed.
import fs from 'node:fs/promises';
import path from 'node:path';

const RAW = path.resolve('.cache/raw');
const OUT = path.resolve('src/data/generated');

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- tags
function tagKind(id) {
  if (id < 1000) return 'class';
  if (id >= 12000 && id < 13000) return 'rarity';
  if (id >= 13000 && id < 14000) return 'style';
  if (id >= 15000 && id < 16000) return 'color';
  if (id >= 20000 && id < 30000) return 'episode';
  if (id >= 50000 && id < 60000) return 'character';
  if (id >= 60000 && id < 70000) return 'card';
  return 'other';
}
const PREFIX_KINDS = {
  Tag: ['class', 'other', 'style'],
  Element: ['color'],
  Episode: ['episode'],
  Rarity: ['rarity'],
  Character: ['character'],
  'Battle Style': ['style'],
  ChaTag: ['class', 'other', 'style'],
  Epi: ['episode'],
  Chara: ['character'],
};

class TagDict {
  constructor() { this.byId = new Map(); this.byName = new Map(); }
  add(id, name) {
    id = Number(id);
    if (!name || id >= 8000000) return;
    name = decode(name).trim();
    if (!this.byId.has(id)) this.byId.set(id, { id, name, kind: tagKind(id) });
    const k = name.toLowerCase();
    if (!this.byName.has(k)) this.byName.set(k, []);
    const arr = this.byName.get(k);
    if (!arr.includes(id)) arr.push(id);
  }
  resolve(name, prefix) {
    const ids = this.byName.get(name.toLowerCase().trim()) || [];
    const kinds = PREFIX_KINDS[prefix];
    const hit = kinds ? ids.find((id) => kinds.includes(tagKind(id))) : ids[0];
    return hit ?? null;
  }
}

// ---------------------------------------------------------------- stats
// Stat keys: hp sa ba sd bd crit critDmg ki heal dmg dmgStrike dmgBlast dmgSpecial
// dmgUltimate dmgStrikeArts dmgBlastArts dmgGuard dmgCut
function statPhrase(raw) {
  let s = raw.replace(/\bmax\b/gi, '').replace(/\bbase\b/gi, '').replace(/\s+/g, ' ').trim();
  const parts = s.split(/\s*(?:&|\band\b)\s*/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  const sideOf = (p) => (/strike/i.test(p) ? 's' : /blast/i.test(p) ? 'b' : null);
  const nounOf = (p) => (/attack/i.test(p) ? 'a' : /defen[cs]e/i.test(p) ? 'd' : null);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^critical damage$/i.test(p)) { out.push('critDmg'); continue; }
    if (/^critical$/i.test(p)) { out.push('crit'); continue; }
    if (/^health$/i.test(p)) { out.push('hp'); continue; }
    if (/^ki recovery$/i.test(p)) { out.push('ki'); continue; }
    let side = sideOf(p), noun = nounOf(p);
    if (!noun) for (let j = i + 1; j < parts.length && !noun; j++) noun = nounOf(parts[j]);
    if (!side) for (let j = i - 1; j >= 0 && !side; j--) side = sideOf(parts[j]);
    if (!side || !noun) return null;
    out.push(side + noun);
  }
  return out.length ? out : null;
}

// Map "Strike Attack" style names (equipment flat lines, ICN lines) to stats + layer.
function namedStat(name) {
  const n = name.replace(/\s+/g, ' ').trim();
  const lower = n.toLowerCase();
  const direct = {
    'inflicted damage': 'dmg', 'damage inflicted': 'dmg',
    'special move damage': 'dmgSpecial', 'ultimate damage': 'dmgUltimate',
    'ultimate/awakened damage': 'dmgUltimate', 'strike damage': 'dmgStrike', 'blast damage': 'dmgBlast',
    'blast arts damage': 'dmgBlastArts', 'strike arts damage': 'dmgStrikeArts',
    'damage guard': 'dmgGuard', 'sustained damage cut': 'dmgCut',
  };
  if (direct[lower]) return { stats: [direct[lower]], layer: 'direct' };
  if (lower === 'health restoration') return { stats: ['heal'], layer: 'pure' };
  if (lower === 'base ki recovery' || lower === 'ki recovery') return { stats: ['ki'], layer: 'base' };
  const isBase = /\bbase\b/i.test(n) || /^max base/i.test(n);
  const stats = statPhrase(n);
  if (!stats) return null;
  return { stats, layer: isBase ? 'base' : 'pure' };
}

// ---------------------------------------------------------------- conditions
// A condition is an OR of AND-groups of tag ids: [[a],[b,c]] = a OR (b AND c). null = anyone.
function parseQuotedTargets(seg, dict, warn) {
  const quoted = [...seg.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const unquoted = quoted.length ? [] : [...seg.matchAll(/(Tag|Episode|Element|Character|Rarity|Battle Style): ([^,"]+?)(?=$|,| or | and )/g)].map((m) => `${m[1]}: ${m[2]}`);
  const items = quoted.length ? quoted : unquoted;
  const ids = [];
  for (const q of items) {
    const m = q.match(/^(Tag|Episode|Element|Character|Rarity|Battle Style):\s*(.+)$/);
    const id = m ? dict.resolve(m[2], m[1]) : dict.resolve(q);
    if (id == null) { warn(`unknown tag "${q}"`); return null; }
    ids.push(id);
  }
  if (!ids.length) return null;
  return /\bboth\b/i.test(seg) ? [ids] : ids.map((i) => [i]);
}

function parseIcnTargets(seg, dict, warn) {
  // "{{ICN:YEL}} & {{ICN:ChaTag}}GT"  or  "{{ICN:RED}}, {{ICN:GRN}}, or {{ICN:Epi}}Dragon Ball Saga"
  const tokens = [...seg.matchAll(/\{\{ICN:([A-Za-z]+)\}\}([^{,&]*?)(?=\s*(?:,|&|\bor\b|$|\{\{))/g)];
  const ids = [];
  for (const t of tokens) {
    const kind = t[1], name = t[2].replace(/^,?\s*or\s*/, '').replace(/["\s]+$/, '').trim();
    let id;
    if (['RED', 'YEL', 'PUR', 'GRN', 'BLU', 'LGT'].includes(kind)) id = dict.resolve(kind, 'Element');
    else id = dict.resolve(name, kind);
    if (id == null) { warn(`unknown icon tag ${kind}:${name}`); return null; }
    ids.push(id);
  }
  if (!ids.length) return null;
  return seg.includes('&') && !/\bor\b|,/.test(seg) ? [ids] : ids.map((i) => [i]);
}

// ---------------------------------------------------------------- Z / Zenkai / Assault text
function parseAbilityText(text, dict, scope) {
  const warnings = [];
  const warn = (w) => warnings.push(w);
  const lines = [];
  const contextual = [];
  const t = text.replace(/\r/g, '').trim();

  const pushStatList = (block, cond) => {
    let n = 0;
    for (const m of block.matchAll(/\+(\d+(?:\.\d+)?)% to ([^.\n]+)\./g)) {
      const ns = namedStat(m[2]);
      if (!ns) { warn(`unparsed stat "${m[2]}"`); continue; }
      lines.push({ cond, stats: ns.stats.map((s) => ({ stat: s, layer: ns.layer, value: +m[1] })) });
      n++;
    }
    for (const m of block.matchAll(/・([^+\n]+?)\s*\+(\d+(?:\.\d+)?)%/g)) {
      const ns = namedStat(m[1]);
      if (!ns) { warn(`unparsed stat "${m[1]}"`); continue; }
      lines.push({ cond, stats: ns.stats.map((s) => ({ stat: s, layer: ns.layer, value: +m[2] })) });
      n++;
    }
    return n;
  };

  // Format 1: "If {{ICN:..}} ...\n・Stat +N%" blocks (newer cards)
  if (/^If \{\{ICN/.test(t) || /\nIf \{\{ICN/.test(t)) {
    for (const block of t.split(/\n\s*\n|(?=\nIf \{\{)/)) {
      const b = block.trim();
      const m = b.match(/^If (.+)\n([\s\S]+)$/);
      if (!m) { if (b) warn(`unparsed block "${b.slice(0, 60)}"`); continue; }
      const cond = parseIcnTargets(m[1], dict, warn);
      if (!cond) continue;
      pushStatList(m[2], cond);
    }
    return { lines, warnings, scope };
  }

  // Format 2: "Increases the following stats of allies when this character is a battle member:" (Assault)
  if (/of allies when this character is a battle member/i.test(t)) {
    pushStatList(t, null);
    return { lines, warnings, scope: 'assault' };
  }

  // Format 3: "[Targets]" list
  if (/\[Targets\]/.test(t)) {
    const [statsPart, targetPart] = t.split('[Targets]');
    const groups = [];
    for (const row of targetPart.split('\n').map((r) => r.trim()).filter(Boolean)) {
      const g = parseQuotedTargets(row.replace(/ characters with /, ' both '), dict, warn);
      if (g) groups.push(...g);
    }
    if (groups.length) pushStatList(statsPart, groups);
    return { lines, warnings, scope };
  }

  // Format 4: "Increases the following stats of <targets> during battle:\n+N% to base X."
  const hdr = t.match(/^Increases the following stat(?:s|uses) of (.+?) during battle:\s*\n([\s\S]+)$/);
  if (hdr) {
    const cond = parseQuotedTargets(hdr[1], dict, warn);
    if (cond) pushStatList(hdr[2], cond);
    return { lines, warnings, scope };
  }

  // Format 5: classic sentence "+N% to <targets> base <stats> [and +N% to ...] during battle."
  let body = t.replace(/\s*during battle\.?\s*(\n|$)/gi, ' and ').replace(/(\s+and\s*)+$/, '').trim()
    .replace(/Ultimate and Awakened/g, 'Ultimate & Awakened')
    // "+3% to "Tag: X" Special Move damage inflicted" -> canonical "by" form
    .replace(/\+(\d+(?:\.\d+)?)% to ((?:"[^"]+"(?:,? or |, )?)+) (Special Move|Ultimate & Awakened|Ultimate|Strike Arts|Blast Arts) damage inflicted/g, '+$1% to $3 damage inflicted by $2')
    .replace(/\+(\d+(?:\.\d+)?)% to Health Restoration of (.+?)(?= and \+|$)/g, '+$1% to $2 Health Restoration')
    .replace(/\+(\d+(?:\.\d+)?)% to base Health of (.+?)(?= and \+|$)/g, '+$1% to $2 max base Health');
  // "+A% to max base Health & +B% to base Critical of <targets>"
  const hc = body.match(/^\+(\d+)% to max base Health & \+(\d+)% to base Critical of (.+)$/i);
  if (hc) {
    const cond = parseQuotedTargets(hc[3], dict, warn);
    if (cond) {
      lines.push({ cond, stats: [{ stat: 'hp', layer: 'base', value: +hc[1] }] });
      lines.push({ cond, stats: [{ stat: 'crit', layer: 'base', value: +hc[2] }] });
    }
    return { lines, warnings, scope };
  }
  const clauses = body.split(/\s+(?:and|&)\s+(?=\+\d)/);
  for (const c of clauses) {
    let m;
    if ((m = c.match(/^\+(\d+(?:\.\d+)?)% to (Special Move|Ultimate & Awakened|Ultimate|Strike Arts|Blast Arts|Strike|Blast) damage inflicted by (.+)$/i))) {
      const map = { 'special move': 'dmgSpecial', 'ultimate & awakened': 'dmgUltimate', ultimate: 'dmgUltimate', 'strike arts': 'dmgStrikeArts', 'blast arts': 'dmgBlastArts', strike: 'dmgStrike', blast: 'dmgBlast' };
      const cond = parseQuotedTargets(m[3], dict, warn);
      if (cond) lines.push({ cond, stats: [{ stat: map[m[2].toLowerCase()], layer: 'direct', value: +m[1] }] });
      continue;
    }
    if ((m = c.match(/^\+(\d+(?:\.\d+)?)% to damage inflicted (?:to|by) (.+)$/i))) {
      const cond = parseQuotedTargets(m[2], dict, warn);
      if (cond) lines.push({ cond, stats: [{ stat: 'dmg', layer: 'direct', value: +m[1] }] });
      continue;
    }
    if ((m = c.match(/^\+(\d+(?:\.\d+)?)% to (.+?) Health Restoration$/i))) {
      const cond = parseQuotedTargets(m[2], dict, warn);
      if (cond) lines.push({ cond, stats: [{ stat: 'heal', layer: 'pure', value: +m[1] }] });
      continue;
    }
    if ((m = c.match(/^\+(\d+(?:\.\d+)?)% to (.+?) (max base [Hh]ealth|base .+)$/))) {
      const stats = statPhrase(m[3]);
      const cond = parseQuotedTargets(m[2], dict, warn);
      if (!stats) { warn(`unparsed stat "${m[3]}"`); continue; }
      if (cond) lines.push({ cond, stats: stats.map((s) => ({ stat: s, layer: 'base', value: +m[1] })) });
      continue;
    }
    if (/Arts cost|Ki |draw/i.test(c)) { contextual.push(c); continue; }
    warn(`unparsed clause "${c.slice(0, 80)}"`);
  }
  return { lines, warnings, scope, contextual };
}

// ---------------------------------------------------------------- equipment lines
function parseEquipLine(text, dict) {
  const warnings = [];
  const warn = (w) => warnings.push(w);
  const t = text.replace(/\s+/g, ' ').replace(/％/g, '%').trim();
  let m;

  // Flat "Base Strike Attack 5.00% ~ 15.00%"
  if ((m = t.match(/^([A-Za-z &/]+?) (\d+(?:\.\d+)?)% ~ (\d+(?:\.\d+)?)%$/))) {
    const ns = namedStat(m[1]);
    if (ns) return { stats: ns.stats, layer: ns.layer, min: +m[2], max: +m[3], cond: null };
  }
  // Fixed multi-stat "Base Health +8% Base Strike & Blast Attack +10% ..."
  if (/^([A-Za-z &]+ \+\d+(?:\.\d+)?% ?)+$/.test(t)) {
    const parts = [...t.matchAll(/([A-Za-z &]+?) \+(\d+(?:\.\d+)?)%/g)];
    const multi = [];
    for (const p of parts) {
      const ns = namedStat(p[1]);
      if (!ns) return { contextual: true, raw: t, warnings: [`unparsed "${p[1]}"`] };
      multi.push({ stats: ns.stats, layer: ns.layer, min: +p[2], max: +p[2], cond: null });
    }
    return { multi };
  }
  // Conditional "5.00% ~ 15.00% to <own> Stat <condition>."
  if ((m = t.match(/^(\d+(?:\.\d+)?)% ~ (\d+(?:\.\d+)?)% to (own )?(Base )?([A-Za-z &]+?(?:Attack|Defense|damage inflicted))(?: (.*))?\.?$/))) {
    const [, lo, hi, , base, statName, rest = ''] = m;
    let stats, layer;
    if (/damage inflicted/i.test(statName)) {
      const k = statName.toLowerCase().replace(' damage inflicted', '').trim();
      stats = [k === 'strike' ? 'dmgStrike' : k === 'blast' ? 'dmgBlast' : 'dmg']; layer = 'direct';
    } else { stats = statPhrase(statName); layer = base ? 'base' : 'pure'; }
    if (!stats) return { contextual: true, raw: t, warnings: [`unparsed stat "${statName}"`] };
    const r = rest.replace(/\.$/, '').trim();
    let cond = null;
    const tg = (seg) => parseQuotedTargets(seg, dict, warn) ?? parseQuotedTargets(seg.replace(/(Tag|Episode|Element|Character|Rarity|Battle Style): /g, '"$1: ').replace(/ battle member/, '" battle member'), dict, warn);
    let x;
    if (!r) cond = null;
    else if ((x = r.match(/^if this character is (.+)$/i))) cond = { type: 'wearer', group: tg(x[1]) };
    else if ((x = r.match(/^when (\d+) battle members are any combination of (.+)$/i))) cond = { type: 'count', min: +x[1], group: tg(x[2].replace(/ and /g, ' or ')), excludeSelf: false };
    else if ((x = r.match(/^(?:when (\d+) battle members are|if there are (\d+) or more) (.+?)(?: battle members)?$/i))) cond = { type: 'count', min: +(x[1] || x[2]), group: tg(x[3]), excludeSelf: false };
    else if ((x = r.match(/^if an? (.+) other than this character is a battle member$/i)) || (x = r.match(/^if a battle member other than this character is (.+)$/i))) cond = { type: 'count', min: 1, group: tg(x[1]), excludeSelf: true };
    else if ((x = r.match(/^when an? (.+) character is a battle member$/i))) cond = { type: 'count', min: 1, group: tg(x[1]), excludeSelf: false };
    else if ((x = r.match(/^when (.+) is a battle member$/i))) cond = { type: 'count', min: 1, group: tg(x[1].includes(' and ') ? 'both ' + x[1] : x[1]), excludeSelf: false };
    else if ((x = r.match(/^(?:per|for each) (.+?) battle member$/i))) cond = { type: 'per', group: tg(x[1]), excludeSelf: false };
    else if (/^per party member using this same Equipment$/i.test(r)) cond = { type: 'sameEquip' };
    else return { contextual: true, raw: t, warnings: [`unparsed condition "${r}"`] };
    if (cond && cond.group === null) return { contextual: true, raw: t, warnings };
    return { stats, layer, min: +lo, max: +hi, cond, warnings };
  }
  // Everything else (Ki restore, matchup damage, drops…) is contextual.
  return { contextual: true, raw: t, warnings: [] };
}

// ---------------------------------------------------------------- main
async function main() {
  const listHtml = await fs.readFile(path.join(RAW, 'characters.html'), 'utf8');
  const fetchedAt = (await fs.readFile(path.join(RAW, 'fetched_at.txt'), 'utf8').catch(() => new Date().toISOString())).trim();
  const dict = new TagDict();
  for (const m of listHtml.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g)) dict.add(m[1], m[2]);

  // list entries
  const listRe = /<a href="character\/(\d+)" class="chara-list[^"]*" data-charaname="([^"]*)"(?: data-charaformname="([^"]*)")? data-element="([^"]*)"(?: data-tagelement="([^"]*)")? data-rarity="([^"]*)" data-zenkai="(\d)" data-lf="(\d)" data-tags="([^"]*)"><div title="([^"]*)"/g;
  const listed = new Map();
  for (const m of listHtml.matchAll(listRe)) {
    listed.set(m[1], { id: +m[1], name: decode(m[2]), forms: m[3] ? decode(m[3]) : null, color: m[4], color2: m[5] || null, rarity: m[6], zenkai: m[7] === '1', lf: m[8] === '1', tags: m[9].split(/\s+/).filter(Boolean).map(Number), card: decode(m[10]) });
  }

  // First pass: extend tag dictionary from every character page
  const charFiles = await fs.readdir(path.join(RAW, 'char'));
  const raw = new Map();
  for (const f of charFiles) {
    const b = JSON.parse(await fs.readFile(path.join(RAW, 'char', f), 'utf8'));
    raw.set(f.replace('.json', ''), b);
    for (const [id, v] of Object.entries(b.tr || {})) dict.add(id, v[0]);
  }

  const characters = [];
  const stats = { chars: 0, zParsed: 0, zTotal: 0, warnings: 0 };
  for (const [id, L] of listed) {
    const b = raw.get(id);
    if (!b) continue;
    const vals = Array.isArray(b.data) ? b.data : Object.values(b.data || {});
    const c = vals.find((v) => String(v.id) === id) || vals[0];
    if (!c) continue;
    const ab = b.ab || {};
    const warnings = [];
    const parseLevels = (ids, scope) => {
      const levels = [];
      for (const aid of (ids || []).filter((x) => x !== -1)) {
        const a = ab[String(aid)];
        if (!a) { levels.push(null); continue; }
        const r = parseAbilityText(a[1], dict, scope);
        stats.zTotal++;
        if (!r.warnings.length && r.lines.length) stats.zParsed++;
        r.warnings.forEach((w) => warnings.push(`${a[0]}: ${w}`));
        levels.push({ name: a[0], text: a[1].replace(/\r/g, ''), lines: r.lines, parsed: !r.warnings.length && r.lines.length > 0, contextual: r.contextual?.length ? r.contextual : undefined });
      }
      return levels.length ? levels : null;
    };
    const cab = c.ab || {};
    const z = parseLevels(cab.z, 'z');
    const zenkai = parseLevels(cab.p, 'zenkai');
    const assault = parseLevels(cab.llz, 'assault');
    const traits = Object.entries(b.tr || {}).filter(([k]) => +k >= 8000000).map(([, v]) => ({ name: decode(v[0]), text: decode(v[1] || '') }));
    const resonance = Object.values(ab).find((a) => /resonance/i.test(a[0] || ''));
    const colors = [L.color, L.color2].filter(Boolean);
    characters.push({
      id: +id, card: L.card, name: L.name, forms: L.forms ? [L.forms] : [], rarity: L.rarity, lf: L.lf,
      color: L.color, colors, tags: [...new Set([...L.tags, ...Object.keys(b.tr || {}).map(Number).filter((n) => n < 8000000)])],
      zenkai: L.zenkai && !!zenkai, icon: c.img || null,
      base: c.max ? { hp: c.max.hp, sa: c.max.sa, ba: c.max.ba, sd: c.max.sd, bd: c.max.bd } : null,
      z, zenkaiZ: zenkai, assault, traits,
      resonance: resonance ? { name: resonance[0], text: resonance[1].replace(/\r/g, '') } : null,
      warnings,
    });
    stats.chars++; stats.warnings += warnings.length;
  }

  // Equipment
  const eqListHtml = await fs.readFile(path.join(RAW, 'equipment.html'), 'utf8');
  const eqFiles = await fs.readdir(path.join(RAW, 'equip'));
  const equipment = [];
  const eqStats = { total: 0, battle: 0, linesParsed: 0, linesContextual: 0 };
  for (const f of eqFiles) {
    const h = await fs.readFile(path.join(RAW, 'equip', f), 'utf8');
    if (!h) continue;
    const id = +f.replace('.html', '');
    const name = stripTags((h.match(/<div class="eqd-name">([\s\S]*?)<\/div>/) || [])[1] || '');
    const rarity = (h.match(/eqx-frame ([a-z_]+)"/) || [])[1] || 'unknown';
    const condGroups = [...h.matchAll(/<div class="eqd-condgrp">([\s\S]*?)<\/div>/g)].map((g) => [...g[1].matchAll(/eqd-badge">([^<]+)</g)].map((b) => decode(b[1])));
    const anyone = /Can be equipped to any character/i.test(h);
    const listStart = h.indexOf('id="eqdCharList"');
    const eligible = listStart >= 0 ? [...h.slice(listStart).matchAll(/href="character\/(\d+)"/g)].map((m) => +m[1]) : [];
    const slotHtml = h.split('<div class="eqd-slot-label">SLOT ').slice(1).map((s) => s.split('<div class="eqd-slot eqd-calc">')[0]);
    const warnings = [];
    const slots = slotHtml.map((s) => {
      const opts = s.includes('eqd-option') ? s.split('<div class="eqd-option">').slice(1) : [s];
      return {
        options: opts.map((o) => {
          const lines = [];
          for (const e of o.matchAll(/<div class="eqd-eff">([\s\S]*?)<\/div>/g)) {
            const txt = stripTags(e[1]);
            const r = parseEquipLine(txt, dict);
            if (r.multi) { lines.push(...r.multi.map((x) => ({ ...x, raw: txt }))); eqStats.linesParsed++; continue; }
            if (r.contextual) { lines.push({ contextual: true, raw: txt }); eqStats.linesContextual++; }
            else { lines.push({ stats: r.stats, layer: r.layer, min: r.min, max: r.max, cond: r.cond, raw: txt }); eqStats.linesParsed++; }
            (r.warnings || []).forEach((w) => warnings.push(w));
          }
          return { lines };
        }),
      };
    });
    const CORE = new Set(['hp', 'sa', 'ba', 'sd', 'bd', 'crit', 'dmg', 'dmgStrike', 'dmgBlast', 'dmgSpecial', 'dmgUltimate', 'dmgGuard', 'dmgCut', 'ki']);
    const isBattle = slots.some((s) => s.options.some((o) => o.lines.some((l) => l.stats && l.stats.some((x) => CORE.has(x)))));
    equipment.push({
      id, name, rarity, icon: `EqIco_${id}`,
      equipConditions: condGroups, anyone, eligible: anyone ? [] : eligible,
      exclusive: !anyone && eligible.length === 1 ? eligible[0] : null,
      slots, battle: isBattle, warnings,
    });
    eqStats.total++; if (isBattle) eqStats.battle++;
  }

  const tags = [...dict.byId.values()].sort((a, b) => a.id - b.id);
  const meta = {
    source: 'dblegends.net (community database)',
    fetchedAt,
    builtAt: new Date().toISOString(),
    counts: { characters: characters.length, equipment: equipment.length, battleEquipment: eqStats.battle, tags: tags.length },
    parse: { zAbilityLevels: stats.zTotal, zAbilityLevelsFullyParsed: stats.zParsed, characterWarnings: stats.warnings, equipLinesParsed: eqStats.linesParsed, equipLinesContextual: eqStats.linesContextual },
  };
  await fs.mkdir(OUT, { recursive: true });
  characters.sort((a, b) => b.id - a.id);
  // ---- validation report: what changed since the last snapshot, what needs a human look
  const prevIds = async (f) => { try { return new Set(JSON.parse(await fs.readFile(path.join(OUT, f), 'utf8')).map((x) => x.id)); } catch { return new Set(); } };
  const prevC = await prevIds('characters.json'), prevE = await prevIds('equipment.json');
  const report = {
    builtAt: new Date().toISOString(),
    newCharacters: characters.filter((c) => prevC.size && !prevC.has(c.id)).map((c) => `${c.card} ${c.name}`),
    newEquipment: equipment.filter((e) => e.battle && prevE.size && !prevE.has(e.id)).map((e) => `${e.id} ${e.name}`),
    removedCharacters: [...prevC].filter((id) => !characters.some((c) => c.id === id)),
    charactersWithUnparsedAbilities: characters.filter((c) => c.warnings.length).map((c) => ({ card: c.card, name: c.name, warnings: c.warnings })),
    charactersMissingZ: characters.filter((c) => !c.z?.some(Boolean)).map((c) => c.card),
    charactersMissingStats: characters.filter((c) => !c.base).map((c) => c.card),
  };
  await fs.mkdir(path.resolve('.cache'), { recursive: true });
  await fs.writeFile(path.resolve('.cache/ingest-report.json'), JSON.stringify(report, null, 2));
  console.log(`New characters: ${report.newCharacters.length}, new equipment: ${report.newEquipment.length}, needing review: ${report.charactersWithUnparsedAbilities.length}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`## Data refresh ${report.builtAt}`, `- New characters: ${report.newCharacters.join(', ') || 'none'}`, `- New equipment: ${report.newEquipment.length}`, `- Characters with unparsed ability text: ${report.charactersWithUnparsedAbilities.length}`].join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }
  await fs.writeFile(path.join(OUT, 'characters.json'), JSON.stringify(characters));
  await fs.writeFile(path.join(OUT, 'equipment.json'), JSON.stringify(equipment.filter((e) => e.battle)));
  await fs.writeFile(path.join(OUT, 'tags.json'), JSON.stringify(tags));
  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
