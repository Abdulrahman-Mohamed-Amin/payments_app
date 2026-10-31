-- الدفعات الجزئية + ملاحظات الدفعات
-- شغّل هذا الملف مرة واحدة من Supabase Dashboard → SQL Editor

-- 1) المبلغ المدفوع جزئياً من كل دفعة
alter table public.payments
  add column if not exists paid_amount numeric not null default 0;

-- 2) ملاحظات الدفعات (تُحذف تلقائياً مع حذف الدفعة)
create table if not exists public.payment_notes (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists payment_notes_payment_id_idx on public.payment_notes(payment_id);

alter table public.payment_notes enable row level security;

drop policy if exists "payment_notes_authenticated_all" on public.payment_notes;
create policy "payment_notes_authenticated_all" on public.payment_notes
  for all to authenticated using (true) with check (true);
