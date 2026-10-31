import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// إدارة المستخدمين — متاحة فقط لمن لديه app_metadata.role = "admin"
// الصلاحيات: admin (كل شيء + إدارة المستخدمين) · full (إدارة الدفعات) · viewer (عرض فقط)

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Permission = "admin" | "full" | "viewer";
const PERMISSIONS: Permission[] = ["admin", "full", "viewer"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function permissionOf(meta: Record<string, unknown> | undefined): Permission {
  if (meta?.role === "admin") return "admin";
  return meta?.payments_manage === false ? "viewer" : "full";
}

// GoTrue يدمج app_metadata مع القيم الحالية، لذا role = null لإزالة صلاحية الأدمن
function appMetaFor(permission: Permission) {
  return {
    role: permission === "admin" ? "admin" : null,
    payments_manage: permission !== "viewer",
  };
}

function toEmail(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@madain.sa`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── التحقق من أن الطالب أدمن ──
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller) return json({ error: "unauthorized" }, 401);
  if (permissionOf(caller.app_metadata) !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const action = body?.action;

  if (action === "list") {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return json({ error: error.message }, 500);
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      username: (u.user_metadata?.username as string) ?? u.email?.split("@")[0] ?? "",
      name: (u.user_metadata?.name as string) ?? "",
      permission: permissionOf(u.app_metadata),
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
    return json({ users });
  }

  if (action === "create") {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    const permission = body.permission as Permission;
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) return json({ error: "invalid_username" }, 400);
    if (password.length < 6) return json({ error: "weak_password" }, 400);
    if (!PERMISSIONS.includes(permission)) return json({ error: "invalid_permission" }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email: toEmail(username),
      password,
      email_confirm: true,
      user_metadata: { name, username: username.toLowerCase(), company: "شركة مدائن العقارية" },
      app_metadata: appMetaFor(permission),
    });
    if (error) return json({ error: error.message.includes("already") ? "user_exists" : error.message }, 400);
    return json({ id: data.user.id });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    const permission = body.permission as Permission | undefined;
    const password = body.password ? String(body.password) : "";
    if (!id) return json({ error: "id required" }, 400);
    if (permission && !PERMISSIONS.includes(permission)) return json({ error: "invalid_permission" }, 400);
    if (id === caller.id && permission && permission !== "admin") return json({ error: "cannot_demote_self" }, 400);
    if (password && password.length < 6) return json({ error: "weak_password" }, 400);

    const attrs: Record<string, unknown> = {};
    if (permission) attrs.app_metadata = appMetaFor(permission);
    if (password) attrs.password = password;
    const { error } = await admin.auth.admin.updateUserById(id, attrs);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "id required" }, 400);
    if (id === caller.id) return json({ error: "cannot_delete_self" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
