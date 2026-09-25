-- DBL Team Forge — initial schema
-- Game data is public read-only; user data (box, saved teams) is private per user via RLS.

create table if not exists public.db_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id integer primary key,           -- dblegends.net tag id
  name text not null,
  kind text not null                -- class | style | rarity | color | episode | character | card | other
);

create table if not exists public.characters (
  id integer primary key,           -- dblegends.net character id
  card_code text not null,          -- e.g. DBL30-01S (stable across languages)
  name text not null,
  form_names text[] not null default '{}',
  rarity text not null,             -- ULTRA | SPARKING | EXTREME | HERO | LEGEND
  legends_limited boolean not null default false,
  color text not null,              -- RED | YEL | PUR | GRN | BLU | LGT
  colors text[] not null default '{}', -- tag-team units can carry two colors
  tag_ids integer[] not null default '{}',
  has_zenkai boolean not null default false,
  icon text,
  base_stats jsonb,                 -- max-level stats from source {hp,sa,ba,sd,bd}
  z_ability jsonb,                  -- structured levels I..IV  (see src/data/types.ts)
  zenkai_ability jsonb,             -- structured Zenkai levels
  assault_ability jsonb,            -- structured Assault Z (battle-member only)
  resonance jsonb,                  -- ULTRA Power Resonance (not calculated in totals)
  traits jsonb,                     -- contextual, uncalculated battle traits
  parse_warnings text[] not null default '{}',
  data jsonb not null,              -- full engine-ready record (src/data/types.ts Character)
  source_url text,
  updated_at timestamptz not null default now()
);
create index if not exists characters_tag_ids_gin on public.characters using gin (tag_ids);
create index if not exists characters_rarity_idx on public.characters (rarity);

create table if not exists public.equipment (
  id integer primary key,
  name text not null,
  rarity text not null,             -- iron | bronze | silver | gold | unique | platinum | event | …
  icon text,
  equip_conditions jsonb,           -- tag groups the wearer must satisfy (OR of AND groups)
  eligible_character_ids integer[] not null default '{}',
  slots jsonb not null,             -- [{options:[{lines:[…]}]}] × 3
  is_battle boolean not null default true, -- false for medal/drop-only pieces
  parse_warnings text[] not null default '{}',
  data jsonb not null,              -- full engine-ready record (src/data/types.ts Equipment)
  source_url text,
  updated_at timestamptz not null default now()
);
create index if not exists equipment_eligible_gin on public.equipment using gin (eligible_character_ids);

-- User data ------------------------------------------------------------------
create table if not exists public.user_box (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id integer not null references public.characters(id) on delete cascade,
  stars smallint,                   -- 1..14 (Z level derived)
  zenkai_level smallint,            -- 0..7
  primary key (user_id, character_id)
);

create table if not exists public.user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id integer not null references public.equipment(id) on delete cascade,
  rolls jsonb not null default '[]' -- chosen option + value per slot
);

create table if not exists public.saved_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  team jsonb not null,              -- serialized TeamState
  created_at timestamptz not null default now()
);

-- RLS -------------------------------------------------------------------------
alter table public.db_meta enable row level security;
alter table public.tags enable row level security;
alter table public.characters enable row level security;
alter table public.equipment enable row level security;
alter table public.user_box enable row level security;
alter table public.user_equipment enable row level security;
alter table public.saved_teams enable row level security;

create policy "public read meta" on public.db_meta for select using (true);
create policy "public read tags" on public.tags for select using (true);
create policy "public read characters" on public.characters for select using (true);
create policy "public read equipment" on public.equipment for select using (true);
-- Writes to game data happen only with the service role key (ingestion job), which bypasses RLS.

create policy "own box" on public.user_box for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own equipment" on public.user_equipment for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own teams" on public.saved_teams for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
