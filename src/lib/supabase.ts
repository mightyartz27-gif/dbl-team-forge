import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when Supabase isn't configured: the app then runs on the bundled snapshot. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
