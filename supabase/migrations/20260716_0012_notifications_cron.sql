-- 주기 알림 점검을 pg_cron으로 예약 (15분 간격)
create extension if not exists pg_cron;

select cron.schedule(
  'generate-periodic-notifications',
  '*/15 * * * *',
  $$select generate_periodic_notifications()$$
);
