import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDuePaymentEmail } from "./template.ts";

// يرسل إيميلاً واحداً لكل دفعة غير مسددة حلّ موعدها ولم يُرسل عنها تنبيه بعد (payments.due_notified_at)
// يُشغَّل يومياً عبر pg_cron — التشغيل المتكرر آمن لأن كل دفعة تُحجز قبل الإرسال

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const RECIPIENT = Deno.env.get("DUE_NOTIFY_EMAIL") ?? "sufyan@madain.sa";
const LOGO_URL = "https://efwfihirfxwncerdsemi.supabase.co/storage/v1/object/public/assets/logo.png";
const APP_URL = "https://abdulrahman-mohamed-amin.github.io/payments_app";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fieldOf(fields: Record<string, string> | null, keys: string[]): string {
  for (const k of keys) if (fields?.[k]) return String(fields[k]).trim();
  return "";
}

Deno.serve(async () => {
  const riyadhToday = new Date(Date.now() + 3 * 3600_000).toISOString().split("T")[0];

  // حجز الدفعات المستحقة (يمنع الإرسال المكرر لو اشتغلت الدالة مرتين)
  const { data: claimed, error } = await supabase
    .from("payments")
    .update({ due_notified_at: new Date().toISOString() })
    .eq("paid", false)
    .is("due_notified_at", null)
    .lte("due_date", riyadhToday)
    .select("id, contract_id, label, amount, paid_amount, due_date");
  if (error) return json({ error: error.message });
  if (!claimed?.length) return json({ sent: 0, message: "No newly due payments" });

  const contractIds = [...new Set(claimed.map((p) => p.contract_id))];
  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, client_name, project_name, unit_price, fields, payments(amount, paid, paid_amount)")
    .in("id", contractIds);
  const byId = new Map((contracts ?? []).map((c) => [c.id, c]));

  const resendKey = Deno.env.get("resend_api_key") ?? Deno.env.get("RESEND_API_KEY") ?? "";
  const results: { id: string; sent: boolean; error?: unknown }[] = [];

  for (const p of claimed) {
    const c = byId.get(p.contract_id) as any;
    if (!c) { results.push({ id: p.id, sent: false, error: "contract not found" }); continue; }
    const fields = c.fields as Record<string, string> | null;
    const all = (c.payments ?? []) as { amount: number; paid: boolean; paid_amount: number }[];

    const { subject, html } = buildDuePaymentEmail({
      clientName: c.client_name,
      projectName: c.project_name,
      unitCode: fieldOf(fields, ["unit_code"]),
      installmentLabel: p.label,
      dueDate: p.due_date,
      amount: Number(p.amount),
      paidAmount: Number(p.paid_amount ?? 0),
      clientPhone: fieldOf(fields, ["phone", "mobile", "الجوال", "رقم_الجوال", "client_phone"]),
      clientEmail: fieldOf(fields, ["email", "mail", "الايميل", "البريد", "البريد_الالكتروني", "client_email"]),
      unitPrice: Number(c.unit_price),
      contractPaid: all.reduce((s, x) => s + (x.paid ? Number(x.amount) : Number(x.paid_amount ?? 0)), 0),
      paidCount: all.filter((x) => x.paid).length,
      totalCount: all.length,
      profileUrl: `${APP_URL}/payments/${encodeURIComponent(c.project_name)}/client/${c.id}`,
      logoUrl: LOGO_URL,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "شركة مدائن العقارية <marketing@madain.sa>", to: RECIPIENT, subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      results.push({ id: p.id, sent: true });
      await supabase.from("email_logs").insert([{ contract_id: c.id, recipient: RECIPIENT, subject, resend_id: body.id, status: "sent" }]);
    } else {
      // فشل الإرسال → نلغي الحجز ليُعاد المحاولة في التشغيل القادم
      await supabase.from("payments").update({ due_notified_at: null }).eq("id", p.id);
      await supabase.from("email_logs").insert([{ contract_id: c.id, recipient: RECIPIENT, subject, status: "failed" }]);
      results.push({ id: p.id, sent: false, error: body });
    }
    await sleep(600); // حد Resend: طلبان في الثانية
  }

  return json({ sent: results.filter((r) => r.sent).length, failed: results.filter((r) => !r.sent).length, results });
});
