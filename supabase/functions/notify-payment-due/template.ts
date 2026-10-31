// قالب إيميل "حلّ موعد دفعة" — يُرسل مرة واحدة لكل دفعة يوم استحقاقها
// مبني بجداول + تنسيق inline ليظهر بشكل صحيح في Gmail و Outlook وتطبيقات الجوال

export interface DuePaymentEmail {
  clientName: string;
  projectName: string;
  unitCode: string;
  installmentLabel: string;
  dueDate: string;        // YYYY-MM-DD
  amount: number;
  paidAmount: number;     // المدفوع جزئياً من هذه الدفعة
  clientPhone: string;
  clientEmail: string;
  unitPrice: number;
  contractPaid: number;   // إجمالي المسدد من العقد
  paidCount: number;
  totalCount: number;
  profileUrl: string;
  logoUrl: string;
}

const BRAND = "#CE8F64";
const BRAND_DARK = "#9A6640";
const INK = "#273240";
const MUTED = "#737B8B";
const LINE = "#E6E8EC";
const CANVAS = "#F7F8FB";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("T")[0].split("-"); return `${d}/${m}/${y}`; };
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function row(label: string, value: string, opts: { bold?: boolean; color?: string; ltr?: boolean; last?: boolean } = {}) {
  const border = opts.last ? "" : `border-bottom:1px solid ${LINE};`;
  return `<tr>
    <td style="padding:12px 16px;${border}font-size:13px;color:${MUTED};white-space:nowrap;" width="38%">${label}</td>
    <td style="padding:12px 16px;${border}font-size:14px;color:${opts.color ?? INK};font-weight:${opts.bold ? 700 : 600};text-align:left;"${opts.ltr ? ' dir="ltr"' : ""}>${value}</td>
  </tr>`;
}

export function buildDuePaymentEmail(d: DuePaymentEmail): { subject: string; html: string } {
  const remaining = Math.max(0, d.amount - d.paidAmount);
  const partial = d.paidAmount > 0 && remaining > 0;
  const contractRemaining = Math.max(0, d.unitPrice - d.contractPaid);
  const pct = d.unitPrice ? Math.min(100, Math.round((d.contractPaid / d.unitPrice) * 100)) : 0;
  const unit = d.unitCode ? `الوحدة ${esc(d.unitCode)}` : "";

  const subject = `حلّ موعد دفعة — ${d.clientName}${d.unitCode ? ` (${d.unitCode})` : ""} · ${fmt(remaining)} ر.س`;

  const details = [
    row("العميل", esc(d.clientName), { bold: true }),
    row("المشروع", esc(d.projectName)),
    d.unitCode ? row("الوحدة", esc(d.unitCode)) : "",
    row("الدفعة", esc(d.installmentLabel)),
    row("تاريخ الاستحقاق", fmtDate(d.dueDate), { color: "#DC2626", bold: true }),
    row("قيمة الدفعة", `${fmt(d.amount)} ر.س`),
    partial ? row("المسدد منها", `${fmt(d.paidAmount)} ر.س`, { color: "#16A34A" }) : "",
    d.clientPhone
      ? row("جوال العميل", `<a href="tel:${esc(d.clientPhone)}" style="color:${INK};text-decoration:none;">${esc(d.clientPhone)}</a>`, { ltr: true })
      : "",
    d.clientEmail
      ? row("إيميل العميل", `<a href="mailto:${esc(d.clientEmail)}" style="color:${INK};text-decoration:none;">${esc(d.clientEmail)}</a>`, { ltr: true })
      : "",
  ].filter(Boolean);
  // آخر صف بدون خط سفلي
  if (details.length) details[details.length - 1] = details[details.length - 1].replace(new RegExp(`border-bottom:1px solid ${LINE};`, "g"), "");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(subject)}</title>
  <style>
    @media only screen and (max-width:620px){
      .wrap{width:100% !important;}
      .px{padding-left:18px !important;padding-right:18px !important;}
      .amount{font-size:30px !important;}
      .stat{display:block !important;width:100% !important;padding:0 0 8px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:Tahoma,'Segoe UI',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(d.clientName)} — ${esc(d.installmentLabel)} مستحقة اليوم بمبلغ ${fmt(remaining)} ر.س</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:24px 12px;">

      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid ${LINE};">

        <!-- Header -->
        <tr><td class="px" style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND_DARK},${BRAND});padding:28px 32px;text-align:right;" dir="rtl">
          <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.85);">شركة مدائن العقارية · تنبيه دفعة</p>
          <h1 style="margin:0;font-size:22px;line-height:1.4;font-weight:800;color:#FFFFFF;">حلّ موعد دفعة اليوم</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#FFFFFF;">${esc(d.clientName)}${unit ? ` &nbsp;·&nbsp; ${unit}` : ""} &nbsp;·&nbsp; ${esc(d.projectName)}</p>
        </td></tr>

        <!-- Amount due -->
        <tr><td class="px" style="padding:28px 32px 8px;" dir="rtl">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:14px;">
            <tr><td style="padding:20px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;color:#B91C1C;font-weight:600;">المبلغ المستحق${partial ? " (المتبقي من الدفعة)" : ""}</p>
              <p class="amount" style="margin:0;font-size:34px;line-height:1.2;font-weight:800;color:#DC2626;" >${fmt(remaining)} <span style="font-size:15px;font-weight:700;">ر.س</span></p>
              <p style="margin:8px 0 0;font-size:13px;color:${MUTED};">${esc(d.installmentLabel)} &nbsp;·&nbsp; تاريخ الاستحقاق ${fmtDate(d.dueDate)}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Details -->
        <tr><td class="px" style="padding:20px 32px 8px;" dir="rtl">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:${INK};">تفاصيل الدفعة</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;border-collapse:separate;">
            ${details.join("")}
          </table>
        </td></tr>

        <!-- Contract summary -->
        <tr><td class="px" style="padding:20px 32px 8px;" dir="rtl">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:${INK};">ملخص العقد</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="stat" width="33%" style="padding:0 0 0 8px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};border:1px solid ${LINE};border-radius:12px;">
                  <tr><td style="padding:14px 10px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;color:${MUTED};">سعر الوحدة</p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:${INK};" >${fmt(d.unitPrice)} <span style="font-size:11px;">ر.س</span></p>
                  </td></tr>
                </table>
              </td>
              <td class="stat" width="33%" style="padding:0 4px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ECFDF5;border:1px solid #BBF7D0;border-radius:12px;">
                  <tr><td style="padding:14px 10px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;color:#15803D;">إجمالي المسدد</p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:#15803D;" >${fmt(d.contractPaid)} <span style="font-size:11px;">ر.س</span></p>
                  </td></tr>
                </table>
              </td>
              <td class="stat" width="33%" style="padding:0 8px 0 0;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;">
                  <tr><td style="padding:14px 10px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;color:#C2410C;">المتبقي من العقد</p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:#C2410C;" >${fmt(contractRemaining)} <span style="font-size:11px;">ر.س</span></p>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Progress -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
            <tr>
              <td style="font-size:12px;color:${MUTED};padding-bottom:6px;">نسبة التحصيل · ${d.paidCount} من ${d.totalCount} دفعات</td>
              <td style="font-size:12px;color:${INK};font-weight:700;text-align:left;padding-bottom:6px;" dir="ltr">${pct}%</td>
            </tr>
            <tr><td colspan="2">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${LINE};border-radius:6px;">
                <tr>${pct > 0 ? `<td width="${pct}%" style="background:${BRAND};height:8px;line-height:8px;font-size:0;border-radius:6px;">&nbsp;</td>` : ""}${pct < 100 ? `<td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td>` : ""}</tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td class="px" align="center" style="padding:26px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${BRAND};border-radius:12px;">
              <a href="${esc(d.profileUrl)}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;">فتح ملف العميل في لوحة التحكم</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td class="px" style="padding:24px 32px 28px;" dir="rtl">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};">
            <tr><td style="padding-top:20px;text-align:center;">
              <img src="${esc(d.logoUrl)}" alt="شركة مدائن العقارية" height="40" style="height:40px;display:inline-block;margin-bottom:10px;border:0;">
              <p style="margin:0;font-size:11px;line-height:1.7;color:#9AA1AE;">تنبيه داخلي تلقائي من لوحة تحكم الدفعات — يُرسل مرة واحدة عند حلول موعد كل دفعة.</p>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
