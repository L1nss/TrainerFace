-- =========================================================
-- TRAINER FACE
-- RBAC + RLS
-- =========================================================

create extension if not exists pgcrypto;

drop table if exists public.load_history cascade;
drop table if exists public.exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.monitor_assignments cascade;
drop table if exists public.profiles cascade;

-- =========================================================
-- PROFILES
-- =========================================================

create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  display_name text,

  email text,

  role text not null
    default 'user'
    check (
      role in (
        'user',
        'monitor',
        'admin'
      )
    ),

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now()
);

-- =========================================================
-- WORKOUTS
-- =========================================================

create table public.workouts (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,

  weekday integer not null
    default 1
    check (
      weekday between 0 and 6
    ),

  notes text,

  created_at timestamptz
    not null
    default now()
);

-- =========================================================
-- EXERCISES
-- =========================================================

create table public.exercises (
  id uuid primary key
    default gen_random_uuid(),

  workout_id uuid not null
    references public.workouts(id)
    on delete cascade,

  name text not null,

  sets integer,

  reps text,

  weight numeric(10,2),

  notes text,

  position integer
    not null
    default 0
);

-- =========================================================
-- MONITOR ASSIGNMENTS
-- =========================================================

create table public.monitor_assignments (
  id uuid primary key
    default gen_random_uuid(),

  monitor_id uuid not null
    references public.profiles(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz
    not null
    default now(),

  unique (
    monitor_id,
    user_id
  )
);

-- =========================================================
-- LOAD HISTORY
-- =========================================================

create table public.load_history (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  exercise_id uuid
    references public.exercises(id)
    on delete set null,

  workout_id uuid
    references public.workouts(id)
    on delete set null,

  exercise_name text not null,

  weight numeric(10,2),

  reps text,

  sets integer,

  recorded_at timestamptz
    not null
    default now(),

  recorded_by uuid
    references public.profiles(id)
    on delete set null
);

-- =========================================================
-- ÍNDICES
-- =========================================================

create index workouts_user_idx
on public.workouts(user_id);

create index exercises_workout_idx
on public.exercises(workout_id);

create index assignments_monitor_idx
on public.monitor_assignments(
  monitor_id
);

create index assignments_user_idx
on public.monitor_assignments(
  user_id
);

create index load_history_user_idx
on public.load_history(
  user_id
);

-- =========================================================
-- CRIAÇÃO AUTOMÁTICA DE PROFILE
-- =========================================================

create or replace function
public.handle_new_user()

returns trigger

language plpgsql

security definer

set search_path = public

as $$

begin

  insert into public.profiles (
    id,
    display_name,
    email,
    role
  )

  values (
    new.id,

    coalesce(
      new.raw_user_meta_data
        ->>'full_name',

      new.raw_user_meta_data
        ->>'name',

      split_part(
        coalesce(
          new.email,
          ''
        ),
        '@',
        1
      )
    ),

    new.email,

    'user'
  )

  on conflict(id)
  do update
  set email =
    excluded.email;

  return new;

end;

$$;

drop trigger if exists
on_auth_user_created
on auth.users;

create trigger
on_auth_user_created

after insert
on auth.users

for each row

execute function
public.handle_new_user();

-- =========================================================
-- SINCRONIZAR USUÁRIOS EXISTENTES
-- =========================================================

insert into public.profiles (
  id,
  display_name,
  email,
  role
)

select
  id,

  coalesce(
    raw_user_meta_data
      ->>'full_name',

    raw_user_meta_data
      ->>'name',

    split_part(
      coalesce(
        email,
        ''
      ),
      '@',
      1
    )
  ),

  email,

  'user'

from auth.users

on conflict(id)
do update
set email =
  excluded.email;

-- =========================================================
-- DEFINIR ADMIN
-- =========================================================

update public.profiles

set
  role = 'admin',
  updated_at = now()

where lower(email) =
      lower(
        'Dalcinryan0123@gmail.com'
      );

-- =========================================================
-- FUNÇÕES RBAC
-- =========================================================

create or replace function
public.current_role()

returns text

language sql

stable

security definer

set search_path = public

as $$

  select coalesce(
    (
      select role
      from public.profiles
      where id = auth.uid()
    ),
    'user'
  );

$$;

create or replace function
public.is_admin()

returns boolean

language sql

stable

security definer

set search_path = public

as $$

  select
    public.current_role()
    = 'admin';

$$;

create or replace function
public.is_monitor_of(
  target_user uuid
)

returns boolean

language sql

stable

security definer

set search_path = public

as $$

  select exists (

    select 1

    from public.monitor_assignments ma

    where ma.monitor_id =
          auth.uid()

      and ma.user_id =
          target_user

  );

$$;

create or replace function
public.can_access_user(
  target_user uuid
)

returns boolean

language sql

stable

security definer

set search_path = public

as $$

  select

    target_user =
      auth.uid()

    or public.is_admin()

    or (
      public.current_role()
      = 'monitor'

      and public.is_monitor_of(
        target_user
      )
    );

$$;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.monitor_assignments
enable row level security;

alter table public.workouts
enable row level security;

alter table public.exercises
enable row level security;

alter table public.load_history
enable row level security;

-- =========================================================
-- PROFILES
-- =========================================================

create policy profiles_select

on public.profiles

for select

using (

  id = auth.uid()

  or public.is_admin()

  or public.is_monitor_of(id)

);

create policy profiles_update

on public.profiles

for update

using (

  public.is_admin()

  or id = auth.uid()

)

with check (

  public.is_admin()

  or (
    id = auth.uid()

    and role =
        public.current_role()
  )

);

create policy profiles_delete

on public.profiles

for delete

using (
  public.is_admin()
);

-- =========================================================
-- MONITOR ASSIGNMENTS
-- =========================================================

create policy assignments_select

on public.monitor_assignments

for select

using (

  public.is_admin()

  or monitor_id =
     auth.uid()

  or user_id =
     auth.uid()

);

create policy assignments_insert

on public.monitor_assignments

for insert

with check (

  public.is_admin()

);

create policy assignments_delete

on public.monitor_assignments

for delete

using (

  public.is_admin()

);

-- =========================================================
-- WORKOUTS
-- =========================================================

create policy workouts_select

on public.workouts

for select

using (

  public.can_access_user(
    user_id
  )

);

create policy workouts_insert

on public.workouts

for insert

with check (

  public.can_access_user(
    user_id
  )

);

create policy workouts_update

on public.workouts

for update

using (

  public.can_access_user(
    user_id
  )

)

with check (

  public.can_access_user(
    user_id
  )

);

create policy workouts_delete

on public.workouts

for delete

using (

  public.can_access_user(
    user_id
  )

);

-- =========================================================
-- EXERCISES
-- =========================================================

create policy exercises_select

on public.exercises

for select

using (

  exists (

    select 1

    from public.workouts w

    where
      w.id =
      exercises.workout_id

      and public.can_access_user(
        w.user_id
      )

  )

);

create policy exercises_insert

on public.exercises

for insert

with check (

  exists (

    select 1

    from public.workouts w

    where
      w.id =
      exercises.workout_id

      and public.can_access_user(
        w.user_id
      )

  )

);

create policy exercises_update

on public.exercises

for update

using (

  exists (

    select 1

    from public.workouts w

    where
      w.id =
      exercises.workout_id

      and public.can_access_user(
        w.user_id
      )

  )

)

with check (

  exists (

    select 1

    from public.workouts w

    where
      w.id =
      exercises.workout_id

      and public.can_access_user(
        w.user_id
      )

  )

);

create policy exercises_delete

on public.exercises

for delete

using (

  exists (

    select 1

    from public.workouts w

    where
      w.id =
      exercises.workout_id

      and public.can_access_user(
        w.user_id
      )

  )

);

-- =========================================================
-- LOAD HISTORY
-- =========================================================

create policy load_history_select

on public.load_history

for select

using (

  public.can_access_user(
    user_id
  )

);

create policy load_history_insert

on public.load_history

for insert

with check (

  public.can_access_user(
    user_id
  )

  and (
    recorded_by =
      auth.uid()

    or recorded_by is null
  )

);

create policy load_history_update

on public.load_history

for update

using (

  public.can_access_user(
    user_id
  )

)

with check (

  public.can_access_user(
    user_id
  )

);

create policy load_history_delete

on public.load_history

for delete

using (

  public.is_admin()

  or recorded_by =
     auth.uid()

);

-- =========================================================
-- VERIFICAÇÃO
-- =========================================================

select
  id,
  email,
  display_name,
  role

from public.profiles

order by email;