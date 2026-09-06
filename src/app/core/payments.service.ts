import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { SupabaseService, ContractWithPayments } from './supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface OverdueItem {
  clientId: string;
  clientName: string;
  unitCode: string;
  projectName: string;
  payment: {
    id: string;
    /** رقم القسط (1-6) — يُستخدم لعرض اسم الدفعة مترجَماً حسب لغة الواجهة الحالية،
     *  بدل الاعتماد على `label` المخزَّن (نص عربي ثابت وقت إنشاء العقد لا يتغيّر مع اللغة) */
    installmentNumber: number;
    amount: number;
    date: string;
  };
}

@Injectable({ providedIn: 'root' })
export class PaymentsService implements OnDestroy {
  private supa = inject(SupabaseService);
  private channel: RealtimeChannel | null = null;

  private _contracts = signal<ContractWithPayments[]>([]);
  private _overdueList = signal<OverdueItem[]>([]);

  readonly contracts = this._contracts.asReadonly();
  readonly overdueList = this._overdueList.asReadonly();
  readonly overdueCount = computed(() => this._overdueList().length);

  constructor() {
    this.refresh();
    this.subscribeRealtime();
  }

  async refresh(): Promise<void> {
    const contracts = await this.supa.loadContracts();
    this._contracts.set(contracts);

    const now = new Date();
    const items: OverdueItem[] = contracts.flatMap(c =>
      c.payments
        .filter(p => !p.paid && new Date(p.due_date) < now)
        .map(p => ({
          clientId: c.id,
          clientName: c.client_name,
          projectName: c.project_name,
          unitCode: (c.fields?.['unit_code'] ?? ''),
          payment: {
            id: p.id,
            installmentNumber: p.installment_number,
            amount: p.amount,
            date: this.formatDate(p.due_date),
          },
        }))
    );
    this._overdueList.set(items);
  }

  private subscribeRealtime(): void {
    const cb = () => { this.refresh(); };
    this.channel = this.supa.getClient()
      .channel('global-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, cb)
      .subscribe();
  }

  ngOnDestroy(): void {
    this.channel?.unsubscribe();
  }

  private formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
}
