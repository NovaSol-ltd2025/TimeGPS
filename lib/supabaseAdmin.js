import { createClient } from '@supabase/supabase-js';

// Lazily create the Supabase client on first *use*, not on module import.
// This matters because `next build` executes a "Collecting page data" step
// that imports every API route module to check whether it can be statically
// optimized — and Vercel's "Sensitive" environment variables (the padlock
// icon in Project Settings) are only decrypted for the Function runtime,
// not exposed to that build step. Creating the client eagerly at import
// time (the old behavior) made `createClient(url, key)` run during build
// with url/key still undefined, throwing "supabaseUrl is required." and
// failing the whole deployment — even though the vars were set correctly
// in Vercel. Deferring creation until a request actually calls
// `supabaseAdmin.from(...)` etc. sidesteps that entirely.
let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables are not set');
  }
  _client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return _client;
}

// A Proxy so existing call sites (`supabaseAdmin.from(...)`,
// `supabaseAdmin.storage...`) keep working unchanged — every property
// access transparently goes through getClient() first.
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    }
  }
);
