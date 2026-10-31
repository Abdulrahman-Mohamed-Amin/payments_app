import { ContractWithPayments, PaymentRow } from './supabase.service';

/** دوال مشتركة لحساب حالة الدفعات وبناء رسالة الواتساب — تُستخدم في صفحة المشروع وبروفايل العميل */

/** المبلغ المدفوع فعلياً من الدفعة: كاملها لو مسجَّلة مدفوعة، وإلا ما دُفع جزئياً */
export function paidAmountOf(p: PaymentRow): number {
  return p.paid ? p.amount : Math.min(p.paid_amount ?? 0, p.amount);
}

export function remainingOf(p: PaymentRow): number {
  return p.amount - paidAmountOf(p);
}

export function isPartial(p: PaymentRow): boolean {
  return !p.paid && (p.paid_amount ?? 0) > 0;
}

export function contractPaidTotal(c: ContractWithPayments): number {
  return c.payments.reduce((s, p) => s + paidAmountOf(p), 0);
}

export function isOverdue(p: PaymentRow): boolean {
  return !p.paid && new Date(p.due_date) < new Date();
}

export function isDueSoon(p: PaymentRow): boolean {
  if (p.paid) return false;
  const diff = (new Date(p.due_date).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 10;
}

/** التذكير فقط للدفعات المتأخرة أو التي باقٍ على موعدها 20 يوماً أو أقل */
export function canRemind(p: PaymentRow): boolean {
  if (p.paid) return false;
  const diff = (new Date(p.due_date).getTime() - Date.now()) / 86400000;
  return diff <= 20;
}

export function fmt(n: number): string { return n.toLocaleString('en-US'); }

export function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

export function clientEmail(c: ContractWithPayments): string {
  const f = c.fields ?? {};
  return f['email'] || f['mail'] || f['الايميل'] || f['البريد'] || f['البريد_الالكتروني'] || f['client_email'] || '';
}

export function clientPhone(c: ContractWithPayments): string {
  const f = c.fields ?? {};
  return (f['phone'] || f['mobile'] || '').replace(/[\s\-\(\)]/g, '');
}

export function hasWaReminder(c: ContractWithPayments): boolean {
  return !!clientPhone(c) && c.payments.some(p => canRemind(p));
}

/** يبني رقم الهاتف الدولي ونص رسالة التذكير لعميل — مشتركة بين الإرسال الفردي والجماعي.
 *  لو لا توجد دفعة تستدعي التذكير يرجع نصاً فارغاً (تُفتح المحادثة بلا رسالة) */
export function buildWhatsAppMessage(
  c: ContractWithPayments, projectName: string, senderName: string,
): { phone: string; text: string } | null {
  let phone = clientPhone(c);
  if (!phone) return null;
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('05')) phone = '966' + phone.slice(1);
  else if (/^5\d{8}$/.test(phone)) phone = '966' + phone;
  else if (!phone.startsWith('966')) phone = '966' + phone;

  const now = new Date();
  const targetPayment =
    c.payments.find(p => !p.paid && new Date(p.due_date) < now) ??
    c.payments.find(p => canRemind(p));
  if (!targetPayment) return { phone, text: '' };

  const unitCode = c.fields?.['unit_code'] ?? '';
  // ملاحظة: نستخدم النص العربي المخزَّن (لا الاسم المترجَم) عمداً — رسالة الواتساب
  // موجّهة للعميل مباشرة وتبقى عربية دائماً بغضّ النظر عن لغة واجهة الموظف
  const paymentLabel = targetPayment.label ?? '';
  const amountNote = ` بمبلغ ${fmt(targetPayment.amount)} ريال`;
  const dueDate = formatDate(targetPayment.due_date);
  const diffDays = Math.round((new Date(targetPayment.due_date).getTime() - now.getTime()) / 86400000);
  const daysNote =
    diffDays < 0 ? ` (مستحقة منذ ${Math.abs(diffDays)} يوم)` :
    diffDays === 0 ? ' (موعدها اليوم)' :
    ` (باقي ${diffDays} يوم)`;
  const partialNote = isPartial(targetPayment)
    ? `\n\nتم سداد ${fmt(paidAmountOf(targetPayment))} ريال من هذه الدفعة، والمتبقي عليكم ${fmt(remainingOf(targetPayment))} ريال.`
    : '';

  const nameParts = c.client_name.trim().split(/\s+/);
  const firstName = nameParts.length > 1
    ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
    : nameParts[0];

  const text =
`السلام عليكم ورحمة الله وبركاته 🌹

أ/ ${firstName}

معك ${senderName || 'عبدالرحمن أمين'} من شركة مدائن العقارية.

حبيت أذكركم بموعد ${paymentLabel}${amountNote}${dueDate ? ' التي بتاريخ ' + dueDate + daysNote : ''} الخاصة بالوحدة رقم ${unitCode} في ${projectName}.${partialNote}

إذا تكرمت، نأمل إكمال السداد في الوقت المناسب. وإذا كان السداد تم بالفعل، فتجاهل الرسالة مع جزيل الشكر.

وإذا احتجت أي مساعدة أو كان عندك أي استفسار، أنا حاضر في أي وقت.`;

  return { phone, text };
}
