-- TrainerFace — schema atualizado com RBAC, dieta e progressão de carga
-- Execute no SQL Editor do Supabase.
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('ADMIN', 'MONITOR', 'USER');
exception when duplicate_object then null;
end $$;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  workout_date date,
  weekday integer check (weekday between 0 and 6),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.workouts add column if not exists weekday integer;
alter table public.workouts alter column workout_date drop not null;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null,
  sets integer,
  reps text,
  weight numeric(10,2),
  notes text,
  position integer not null default 0
);

-- Compatibilidade caso reps tenha sido criado como integer em uma instalação antiga.
do $$ begin
  alter table public.exercises alter column reps type text using reps::text;
exception when others then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.app_role not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitor_students (
  monitor_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (monitor_id, student_id),
  constraint monitor_student_distinct check (monitor_id <> student_id)
);

create table if not exists public.workout_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  exercise_name text not null,
  weight numeric(10,2) not null check (weight >= 0),
  reps integer check (reps is null or reps > 0),
  sets integer check (sets is null or sets > 0),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  objective text not null default 'rotina_equilibrada',
  preferences text,
  restrictions text,
  meals_per_day integer not null default 4 check (meals_per_day between 3 and 6),
  plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path=public as $$
  select case
    when lower(coalesce(auth.jwt()->>'email',''))='dalcinryan0123@gmail.com' then 'ADMIN'::public.app_role
    else coalesce((select role from public.profiles where id=auth.uid()),'USER'::public.app_role)
  end;
$$;

create or replace function public.can_view_student(target_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid()=target_user
    or public.current_user_role()='ADMIN'::public.app_role
    or (public.current_user_role()='MONITOR'::public.app_role and exists(
      select 1 from public.monitor_students ms where ms.monitor_id=auth.uid() and ms.student_id=target_user
    ));
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(
    new.id, lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,'aluno'),'@',1)),
    case when lower(coalesce(new.email,''))='dalcinryan0123@gmail.com' then 'ADMIN'::public.app_role else 'USER'::public.app_role end
  )
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id,email,full_name,role)
select id,lower(email),coalesce(raw_user_meta_data->>'full_name',split_part(coalesce(email,'aluno'),'@',1)),
case when lower(coalesce(email,''))='dalcinryan0123@gmail.com' then 'ADMIN'::public.app_role else 'USER'::public.app_role end
from auth.users
on conflict(id) do update set email=excluded.email;

update public.profiles set role='ADMIN'::public.app_role where lower(email)='dalcinryan0123@gmail.com';

alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.profiles enable row level security;
alter table public.monitor_students enable row level security;
alter table public.workout_progress enable row level security;
alter table public.diet_plans enable row level security;

-- Remove políticas antigas
drop policy if exists "Users can view own workouts" on public.workouts;
drop policy if exists "Users can insert own workouts" on public.workouts;
drop policy if exists "Users can update own workouts" on public.workouts;
drop policy if exists "Users can delete own workouts" on public.workouts;
drop policy if exists "Users can view exercises from own workouts" on public.exercises;
drop policy if exists "Users can insert exercises into own workouts" on public.exercises;
drop policy if exists "Users can update exercises from own workouts" on public.exercises;
drop policy if exists "Users can delete exercises from own workouts" on public.exercises;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (public.can_view_student(id) or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
using (auth.uid()=id or public.current_user_role()='ADMIN'::public.app_role)
with check (auth.uid()=id or public.current_user_role()='ADMIN'::public.app_role);

drop policy if exists monitor_students_select on public.monitor_students;
create policy monitor_students_select on public.monitor_students for select
using (monitor_id=auth.uid() or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists monitor_students_admin_write on public.monitor_students;
create policy monitor_students_admin_write on public.monitor_students for all
using (public.current_user_role()='ADMIN'::public.app_role)
with check (public.current_user_role()='ADMIN'::public.app_role);

drop policy if exists workouts_select_rbac on public.workouts;
create policy workouts_select_rbac on public.workouts for select using (public.can_view_student(user_id));
drop policy if exists workouts_insert_rbac on public.workouts;
create policy workouts_insert_rbac on public.workouts for insert with check (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists workouts_update_rbac on public.workouts;
create policy workouts_update_rbac on public.workouts for update
using (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role)
with check (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists workouts_delete_rbac on public.workouts;
create policy workouts_delete_rbac on public.workouts for delete using (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);

drop policy if exists exercises_select_rbac on public.exercises;
create policy exercises_select_rbac on public.exercises for select using (
  exists(select 1 from public.workouts w where w.id=workout_id and public.can_view_student(w.user_id))
);
drop policy if exists exercises_write_rbac on public.exercises;
create policy exercises_write_rbac on public.exercises for all
using (exists(select 1 from public.workouts w where w.id=workout_id and (w.user_id=auth.uid() or public.current_user_role()='ADMIN'::public.app_role)))
with check (exists(select 1 from public.workouts w where w.id=workout_id and (w.user_id=auth.uid() or public.current_user_role()='ADMIN'::public.app_role)));

drop policy if exists progress_select_rbac on public.workout_progress;
create policy progress_select_rbac on public.workout_progress for select using (public.can_view_student(user_id));
drop policy if exists progress_insert_rbac on public.workout_progress;
create policy progress_insert_rbac on public.workout_progress for insert with check (auth.uid()=user_id);
drop policy if exists progress_update_rbac on public.workout_progress;
create policy progress_update_rbac on public.workout_progress for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists progress_delete_rbac on public.workout_progress;
create policy progress_delete_rbac on public.workout_progress for delete using (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);

drop policy if exists diets_select_rbac on public.diet_plans;
create policy diets_select_rbac on public.diet_plans for select using (public.can_view_student(user_id));
drop policy if exists diets_insert_rbac on public.diet_plans;
create policy diets_insert_rbac on public.diet_plans for insert with check (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists diets_update_rbac on public.diet_plans;
create policy diets_update_rbac on public.diet_plans for update
using (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role)
with check (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);
drop policy if exists diets_delete_rbac on public.diet_plans;
create policy diets_delete_rbac on public.diet_plans for delete using (auth.uid()=user_id or public.current_user_role()='ADMIN'::public.app_role);

create index if not exists workouts_user_weekday_idx on public.workouts(user_id,weekday);
create index if not exists exercises_workout_idx on public.exercises(workout_id);
create index if not exists monitor_students_monitor_idx on public.monitor_students(monitor_id);
create index if not exists monitor_students_student_idx on public.monitor_students(student_id);
create index if not exists workout_progress_user_exercise_date_idx on public.workout_progress(user_id,exercise_name,recorded_at);
create index if not exists diet_plans_user_date_idx on public.diet_plans(user_id,created_at desc);
