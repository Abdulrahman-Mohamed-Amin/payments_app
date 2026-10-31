-- تنبيه بالإيميل مرة واحدة عند حلول موعد كل دفعة (Edge Function: notify-payment-due)

-- 1) وقت إرسال التنبيه — null = لم يُرسل بعد
alter table public.payments
  add column if not exists due_notified_at timestamptz;

-- 2) الدفعات المتأخرة قبل تفعيل الميزة تُعتبر مُبلَّغاً عنها حتى لا تُرسل دفعة واحدة كبيرة من الإيميلات
update public.payments
  set due_notified_at = now()
  where due_notified_at is null
    and not paid
    and due_date < (now() at time zone 'Asia/Riyadh')::date;

-- 3) دفعة جديدة أو تاريخ استحقاق جديد:
--    اليوم أو بعده → التنبيه مُفعّل (يُرسل يوم الاستحقاق)
--    في الماضي → يُعتبر مُبلَّغاً (حتى لا تصل إيميلات متراكمة عند استيراد عملاء قدامى أو إعادة حساب التواريخ)
create or replace function public.reset_due_notification()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.due_date is distinct from old.due_date then
    new.due_notified_at := case
      when new.due_date >= (now() at time zone 'Asia/Riyadh')::date then null
      else coalesce(case when tg_op = 'UPDATE' then old.due_notified_at end, now())
    end;
  end if;
  return new;
end $$;

drop trigger if exists payments_reset_due_notification on public.payments;
create trigger payments_reset_due_notification
  before insert or update of due_date on public.payments
  for each row execute function public.reset_due_notification();

-- 4) تشغيل يومي الساعة 8 صباحاً بتوقيت الرياض (05:00 UTC)
select cron.unschedule('notify-payment-due-daily')
  where exists (select 1 from cron.job where jobname = 'notify-payment-due-daily');
select cron.schedule(
  'notify-payment-due-daily',
  '0 5 * * *',
  $$ select net.http_post(
       url := 'https://efwfihirfxwncerdsemi.supabase.co/functions/v1/notify-payment-due',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) as request_id; $$
);
