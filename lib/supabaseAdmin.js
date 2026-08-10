import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  // Thrown lazily at request time inside handlers instead of at import time
  // so `next build` doesn't fail if env vars are only set in Vercel.
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false }
});
