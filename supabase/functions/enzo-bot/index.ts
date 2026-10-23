import runtime from './runtime.mjs';
import { createHandler, createRpc } from './handler.mjs';
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const rpc = createRpc(Deno.env.get('SUPABASE_URL'), keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
Deno.serve(createHandler({ runtime, rpc, waitUntil: (work: Promise<unknown>) => EdgeRuntime.waitUntil(work) }));
