begin;

alter table public.intentlock_events
  drop constraint if exists intentlock_events_event_name_check;

alter table public.intentlock_events
  add constraint intentlock_events_event_name_check
  check (event_name in (
    'visit', 'input_edited', 'analysis_completed', 'repeat_use', 'result_copied', 'pricing_interest'
  ));

commit;
