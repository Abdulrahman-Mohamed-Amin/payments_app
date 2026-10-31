import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../core/icon/icon.component';
import { SupabaseService, ContractWithPayments, PaymentRow, PaymentNote } from '../../core/supabase.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import * as PU from '../../core/payment-utils';

/** بروفايل عميل واحد: بياناته، ملخّص السداد، وكل دفعاته مع الدفعات الجزئية والملاحظات */
@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, TranslocoModule],
  templateUrl: './client-profile.component.html',
})
export class ClientProfileComponent implements OnInit, OnDestroy {
  private supa = inject(SupabaseService);
  private transloco = inject(TranslocoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private paramSub?: Subscription;
  private realtimeChannel?: RealtimeChannel;

  projectName = signal('');
  contract = signal<ContractWithPayments | null>(null);
  loading = signal(true);
  notes = signal<PaymentNote[]>([]);

  // ── Helpers exposed to the template ─────────────────────────────────────────
  readonly fmt = PU.fmt;
  readonly formatDate = PU.formatDate;
  readonly isOverdue = PU.isOverdue;
  readonly isDueSoon = PU.isDueSoon;
  readonly canRemind = PU.canRemind;
  readonly isPartial = PU.isPartial;
  readonly paidAmountOf = PU.paidAmountOf;
  readonly remainingOf = PU.remainingOf;
  readonly clientEmail = PU.clientEmail;
  readonly clientPhone = PU.clientPhone;

  paidTotal = computed(() => { const c = this.contract(); return c ? PU.contractPaidTotal(c) : 0; });
  remaining = computed(() => (this.contract()?.unit_price ?? 0) - this.paidTotal());
  paidCount = computed(() => this.contract()?.payments.filter(p => p.paid).length ?? 0);
  progressPct = computed(() => {
    const price = this.contract()?.unit_price ?? 0;
    return price ? Math.min(100, Math.round(this.paidTotal() / price * 100)) : 0;
  });

  /** بيانات إضافية من حقول العقد تُعرض في البروفايل (ما عدا الحقول المعروضة في الرأس) */
  extraFields = computed(() => {
    const f = this.contract()?.fields ?? {};
    const keys: { key: string; label: string }[] = [
      { key: 'id', label: 'profile.nationalId' },
      { key: 'natonal', label: 'profile.nationality' },
      { key: 'area', label: 'profile.area' },
      { key: 'floor', label: 'profile.floor' },
      { key: 'address', label: 'profile.address' },
    ];
    return keys.filter(k => f[k.key]).map(k => ({ label: k.label, value: f[k.key] }));
  });

  /** أقرب دفعة غير مسدّدة (متأخرة أو قادمة) */
  nextPayment = computed(() =>
    [...(this.contract()?.payments ?? [])]
      .filter(p => !p.paid)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null);
  overdueCount = computed(() => this.contract()?.payments.filter(p => PU.isOverdue(p)).length ?? 0);

  /** عدد الأيام حتى موعد الدفعة (سالب = متأخرة) */
  daysUntil(p: PaymentRow): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(p.due_date.split('T')[0] + 'T00:00:00').getTime() - today.getTime()) / 86400000);
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
  }

  notesCount(p: PaymentRow): number { return this.notes().filter(n => n.payment_id === p.id).length; }

  installmentLabel(p: PaymentRow): string {
    const key = 'payments.ordinal' + p.installment_number;
    const ordinal = this.transloco.translate(key);
    return `${this.transloco.translate('payments.installment')} ${ordinal === key ? p.installment_number : ordinal}`;
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  ngOnInit() {
    this.paramSub = this.route.paramMap.subscribe(async params => {
      this.projectName.set(decodeURIComponent(params.get('project') ?? ''));
      const id = params.get('id') ?? '';
      this.loading.set(true);
      await this.reload(id);
      this.loading.set(false);
      this.subscribeRealtime(id);
    });
  }

  ngOnDestroy() {
    this.paramSub?.unsubscribe();
    this.realtimeChannel?.unsubscribe();
  }

  private async reload(id: string) {
    const c = await this.supa.loadContract(id);
    this.contract.set(c);
    if (c) await this.reloadNotes();
  }

  private async reloadNotes() {
    const c = this.contract();
    if (!c) return;
    const list = await this.supa.loadPaymentNotes(c.payments.map(p => p.id));
    this.notes.set(list ?? []);
  }

  private subscribeRealtime(id: string) {
    this.realtimeChannel?.unsubscribe();
    this.realtimeChannel = this.supa.getClient()
      .channel('client-payments-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments', filter: `contract_id=eq.${id}` }, async () => {
        const c = await this.supa.loadContract(id);
        if (c) this.contract.set(c);
      })
      .subscribe();
  }

  back() { this.router.navigate(['/payments', this.projectName()]); }

  private patchPayment(id: string, updates: Partial<PaymentRow>) {
    this.contract.update(c => c && {
      ...c,
      payments: c.payments.map(p => p.id !== id ? p : { ...p, ...updates }),
    });
  }

  // ── Register / cancel full payment ──────────────────────────────────────────
  async toggle(p: PaymentRow) {
    const c = this.contract();
    if (!c || !this.auth.canManagePayments) return;
    const ok = await this.supa.togglePayment(p.id, p.paid);
    if (!ok) {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('detail.changeNotSavedRetry'));
      return;
    }
    const nowPaid = !p.paid;
    this.patchPayment(p.id, { paid: nowPaid, paid_at: nowPaid ? new Date().toISOString() : null });
    const label = `${this.installmentLabel(p)} — ${c.client_name}`;
    if (nowPaid) this.toast.success(this.transloco.translate('detail.paymentRegisteredToast'), label);
    else this.toast.info(this.transloco.translate('detail.paymentCancelledToast'), label);
  }

  // ── Partial payment ─────────────────────────────────────────────────────────
  partialTarget: PaymentRow | null = null;
  partialAmount = '';
  savingPartial = false;

  openPartial(p: PaymentRow) {
    if (!this.auth.canManagePayments) return;
    this.partialTarget = p;
    this.partialAmount = p.paid_amount ? String(p.paid_amount) : '';
  }
  closePartial() { this.partialTarget = null; }

  get partialValid(): boolean {
    const n = Number(this.partialAmount);
    return this.partialAmount !== '' && !isNaN(n) && n >= 0 && !!this.partialTarget && n <= this.partialTarget.amount;
  }
  get partialRemaining(): number {
    return (this.partialTarget?.amount ?? 0) - (Number(this.partialAmount) || 0);
  }

  async savePartial() {
    const p = this.partialTarget;
    if (!p || !this.partialValid || this.savingPartial) return;
    this.savingPartial = true;
    const updates = await this.supa.setPaidAmount(p, Math.round(Number(this.partialAmount)));
    this.savingPartial = false;
    if (!updates) {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('profile.migrationHint'));
      return;
    }
    this.patchPayment(p.id, updates);
    this.toast.success(
      this.transloco.translate(updates.paid ? 'detail.paymentRegisteredToast' : 'profile.partialSavedToast'),
      this.installmentLabel(p),
    );
    this.partialTarget = null;
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  notesTarget: PaymentRow | null = null;
  newNote = '';
  addingNote = false;
  editingNoteId = '';
  editingNoteBody = '';
  deletingNoteId = '';

  notesFor(p: PaymentRow): PaymentNote[] { return this.notes().filter(n => n.payment_id === p.id); }

  openNotes(p: PaymentRow) {
    this.notesTarget = p;
    this.newNote = '';
    this.editingNoteId = '';
  }
  closeNotes() { this.notesTarget = null; this.editingNoteId = ''; }

  async addNote() {
    const p = this.notesTarget;
    const body = this.newNote.trim();
    if (!p || !body || this.addingNote) return;
    this.addingNote = true;
    const note = await this.supa.addPaymentNote(p.id, body);
    this.addingNote = false;
    if (!note) {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('profile.migrationHint'));
      return;
    }
    this.notes.update(list => [note, ...list]);
    this.newNote = '';
  }

  startEditNote(n: PaymentNote) { this.editingNoteId = n.id; this.editingNoteBody = n.body; }
  cancelEditNote() { this.editingNoteId = ''; }

  async saveEditNote() {
    const body = this.editingNoteBody.trim();
    if (!this.editingNoteId || !body) return;
    const updated = await this.supa.updatePaymentNote(this.editingNoteId, body);
    if (!updated) {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('detail.changeNotSavedRetry'));
      return;
    }
    this.notes.update(list => list.map(n => n.id === updated.id ? updated : n));
    this.editingNoteId = '';
  }

  async deleteNote(n: PaymentNote) {
    if (this.deletingNoteId) return;
    this.deletingNoteId = n.id;
    const ok = await this.supa.deletePaymentNote(n.id);
    this.deletingNoteId = '';
    if (!ok) {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('detail.changeNotSavedRetry'));
      return;
    }
    this.notes.update(list => list.filter(x => x.id !== n.id));
  }

  formatDateTime(iso: string): string {
    const d = new Date(iso);
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ── Edit client ─────────────────────────────────────────────────────────────
  editOpen = false;
  editName = '';
  editEmail = '';
  editPhone = '';
  editUnitCode = '';
  editContractDate = '';
  saving = false;

  openEdit() {
    const c = this.contract();
    if (!c || !this.auth.canManagePayments) return;
    this.editName = c.client_name;
    this.editEmail = c.fields['email'] ?? '';
    this.editPhone = c.fields['phone'] ?? '';
    this.editUnitCode = c.fields['unit_code'] ?? '';
    this.editContractDate = c.contract_date ?? '';
    this.editOpen = true;
  }
  cancelEdit() { this.editOpen = false; }

  async saveEdit() {
    const c = this.contract();
    if (!c || !this.auth.canManagePayments) return;
    this.saving = true;
    const newFields = { ...(c.fields ?? {}), unit_code: this.editUnitCode, email: this.editEmail.trim(), phone: this.editPhone.trim() };
    const dateChanged = this.editContractDate && this.editContractDate !== c.contract_date;

    const [ok, updatedPayments] = await Promise.all([
      this.supa.updateContract(c.id, { client_name: this.editName, contract_date: this.editContractDate, fields: newFields }),
      dateChanged ? this.supa.recalcPaymentDates(c.payments, this.editContractDate) : Promise.resolve(null),
    ]);

    if (ok) {
      this.contract.set({
        ...c,
        client_name: this.editName,
        contract_date: this.editContractDate,
        fields: newFields,
        payments: updatedPayments ?? c.payments,
      });
      if (dateChanged) this.toast.success(this.transloco.translate('detail.updatedToast'), this.transloco.translate('detail.datesRecalculated'));
    }
    this.editOpen = false;
    this.saving = false;
  }

  // ── Delete client ───────────────────────────────────────────────────────────
  deleteOpen = false;
  deleting = false;

  async executeDelete() {
    const c = this.contract();
    if (!c || !this.auth.canManagePayments) return;
    this.deleting = true;
    const ok = await this.supa.deleteContract(c.id);
    this.deleting = false;
    this.deleteOpen = false;
    if (ok) this.back();
  }

  // ── Edit / delete a single payment (استثناء لعميل معيّن: مبلغ، تاريخ، أو حذف الدفعة كلها) ──
  editPaymentTarget: PaymentRow | null = null;
  editPaymentAmount = '';
  editPaymentPercent = '';
  editPaymentDate = '';
  savingPayment = false;
  confirmDeletePayment = false;
  deletingPayment = false;

  openEditPayment(p: PaymentRow) {
    const c = this.contract();
    if (!c || !this.auth.canManagePayments) return;
    this.editPaymentTarget = p;
    this.editPaymentAmount = String(p.amount);
    this.editPaymentPercent = c.unit_price ? String(+(p.amount / c.unit_price * 100).toFixed(2)) : '';
    this.editPaymentDate = p.due_date;
    this.confirmDeletePayment = false;
  }
  cancelEditPayment() {
    this.editPaymentTarget = null;
    this.confirmDeletePayment = false;
  }

  /** كتابة نسبة مئوية تحسب المبلغ تلقائياً من سعر وحدة العقد */
  onEditPaymentPercentChange() {
    const price = this.contract()?.unit_price ?? 0;
    const pct = Number(this.editPaymentPercent);
    if (price && pct) this.editPaymentAmount = String(Math.round(price * pct / 100));
  }
  /** كتابة مبلغ مباشرة تحدّث النسبة المقابلة للعرض فقط */
  onEditPaymentAmountChange() {
    const price = this.contract()?.unit_price ?? 0;
    const amount = Number(this.editPaymentAmount);
    if (price && amount) this.editPaymentPercent = String(+(amount / price * 100).toFixed(2));
  }

  get editPaymentValid(): boolean {
    const amount = Number(this.editPaymentAmount);
    return !!amount && amount > 0 && !!this.editPaymentDate;
  }

  async saveEditPayment() {
    const c = this.contract();
    if (!c || !this.editPaymentTarget || !this.editPaymentValid || this.savingPayment || !this.auth.canManagePayments) return;
    this.savingPayment = true;
    const id = this.editPaymentTarget.id;
    const amount = Math.round(Number(this.editPaymentAmount));
    const dueDate = this.editPaymentDate;

    const ok = await this.supa.updatePayment(id, { amount, due_date: dueDate });
    if (ok) {
      this.patchPayment(id, { amount, due_date: dueDate });
      this.toast.success(this.transloco.translate('detail.paymentUpdatedToast'), c.client_name);
      this.cancelEditPayment();
    } else {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('detail.changeNotSavedRetry'));
    }
    this.savingPayment = false;
  }

  askDeletePayment() { this.confirmDeletePayment = true; }
  cancelDeletePaymentConfirm() { this.confirmDeletePayment = false; }

  async executeDeletePayment() {
    const c = this.contract();
    if (!c || !this.editPaymentTarget || this.deletingPayment || !this.auth.canManagePayments) return;
    if (c.payments.length <= 1) {
      this.toast.error(this.transloco.translate('detail.cannotDeleteLastPayment'));
      return;
    }
    this.deletingPayment = true;
    const id = this.editPaymentTarget.id;

    const ok = await this.supa.deletePayment(id);
    if (ok) {
      const remainingIds = c.payments
        .filter(p => p.id !== id)
        .sort((a, b) => a.installment_number - b.installment_number)
        .map(p => p.id);
      await this.supa.renumberPayments(remainingIds);
      await this.reload(c.id);
      this.toast.success(this.transloco.translate('detail.paymentDeletedToast'), c.client_name);
      this.cancelEditPayment();
    } else {
      this.toast.error(this.transloco.translate('detail.genericError'), this.transloco.translate('detail.changeNotSavedRetry'));
    }
    this.deletingPayment = false;
  }

  // ── Email reminder / statement ──────────────────────────────────────────────
  remindingId = '';

  async sendEarlyReminder(p: PaymentRow) {
    const c = this.contract();
    if (!c || this.remindingId || p.reminder_count >= 2) return;
    this.remindingId = p.id;
    const res = await this.supa.sendEarlyReminder(p.id, this.projectName());
    this.remindingId = '';
    if (res.sent) {
      const count = res.reminder_count ?? (p.reminder_count + 1);
      this.patchPayment(p.id, { last_reminded_at: new Date().toISOString(), reminder_count: count });
      this.toast.success(this.transloco.translate('detail.reminderSentToast'), `${c.client_name} · ${count}/2`);
    } else if (res.limit_reached) {
      this.toast.error(this.transloco.translate('detail.reminderLimitReached'));
    } else {
      this.toast.error(this.transloco.translate(res.error?.includes('إيميل') ? 'detail.noEmailForClient' : 'detail.reminderFailed'));
    }
  }

  sendingStatement = false;

  async sendStatement() {
    const c = this.contract();
    if (!c || this.sendingStatement) return;
    if (!PU.clientEmail(c)) {
      this.toast.error(this.transloco.translate('detail.noEmailForClient'));
      return;
    }
    this.sendingStatement = true;
    try {
      const res = await fetch(
        `https://efwfihirfxwncerdsemi.supabase.co/functions/v1/send-statement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contract_id: c.id }),
        }
      );
      const result = await res.json();
      if (result.sent) this.toast.success(this.transloco.translate('detail.statementSentToast'), c.client_name);
      else this.toast.error(this.transloco.translate('detail.statementFailed'));
    } catch {
      this.toast.error(this.transloco.translate('detail.statementFailed'));
    }
    this.sendingStatement = false;
  }

  openWhatsApp() {
    const c = this.contract();
    if (!c) return;
    const built = PU.buildWhatsAppMessage(c, this.projectName(), this.auth.displayName);
    if (!built) return;
    const textParam = built.text ? `&text=${encodeURIComponent(built.text)}` : '';
    window.location.href = `whatsapp://send?phone=${built.phone}${textParam}`;
  }
}
