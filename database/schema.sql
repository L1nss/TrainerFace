-- TrainerFace — banco de dados Supabase
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  workout_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null,
  sets integer,
  reps integer,
  weight numeric(10,2),
  notes text,
  position integer not null default 0
);

alter table public.workouts enable row level security;
alter table public.exercises enable row level security;

drop policy if exists "Users can view own workouts" on public.workouts;
create policy "Users can view own workouts"
on public.workouts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own workouts" on public.workouts;
create policy "Users can insert own workouts"
on public.workouts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own workouts" on public.workouts;
create policy "Users can update own workouts"
on public.workouts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own workouts" on public.workouts;
create policy "Users can delete own workouts"
on public.workouts for delete
using (auth.uid() = user_id);

drop policy if exists "Users can view exercises from own workouts" on public.exercises;
create policy "Users can view exercises from own workouts"
on public.exercises for select
using (
  exists (
    select 1 from public.workouts
    where workouts.id = exercises.workout_id
    and workouts.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert exercises into own workouts" on public.exercises;
create policy "Users can insert exercises into own workouts"
on public.exercises for insert
with check (
  exists (
    select 1 from public.workouts
    where workouts.id = exercises.workout_id
    and workouts.user_id = auth.uid()
  )
);

drop policy if exists "Users can update exercises from own workouts" on public.exercises;
create policy "Users can update exercises from own workouts"
on public.exercises for update
using (
  exists (
    select 1 from public.workouts
    where workouts.id = exercises.workout_id
    and workouts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workouts
    where workouts.id = exercises.workout_id
    and workouts.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete exercises from own workouts" on public.exercises;
create policy "Users can delete exercises from own workouts"
on public.exercises for delete
using (
  exists (
    select 1 from public.workouts
    where workouts.id = exercises.workout_id
    and workouts.user_id = auth.uid()
  )
);

create index if not exists workouts_user_date_idx on public.workouts(user_id, workout_date desc);
create index if not exists exercises_workout_idx on public.exercises(workout_id);
