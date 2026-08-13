-- =========================================================
-- TRAINER FACE
-- DATABASE + RBAC + RLS
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- LIMPEZA
-- =========================================================

drop table if exists public.load_history cascade;
drop table if exists public.exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.monitor_assignments cascade;
drop table if exists public.profiles cascade;

drop function if exists public.current_role() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_monitor_of(uuid) cascade;
drop function if exists public.can_access_user(uuid) cascade;
drop function if exists public.handle_new_user() cascade;

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

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now()
);

-- =========================================================
-- WORKOUTS
-- =========================================================

create table public.workouts (
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    name text not null,

    weekday integer not null
        default 1
        check (
            weekday between 0 and 6
        ),

    notes text,

    created_at timestamptz not null
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

    position integer not null
        default 0,

    created_at timestamptz not null
        default now()
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

    created_at timestamptz not null
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

    recorded_at timestamptz not null
        default now(),

    recorded_by uuid
        references public.profiles(id)
        on delete set null
);

-- =========================================================
-- ÍNDICES
-- =========================================================

create index if not exists workouts_user_idx
on public.workouts(user_id);

create index if not exists exercises_workout_idx
on public.exercises(workout_id);

create index if not exists assignments_monitor_idx
on public.monitor_assignments(monitor_id);

create index if not exists assignments_user_idx
on public.monitor_assignments(user_id);

create index if not exists load_history_user_idx
on public.load_history(user_id);

create index if not exists load_history_exercise_idx
on public.load_history(exercise_id);

-- =========================================================
-- FUNÇÃO: CRIAR PROFILE AUTOMATICAMENTE
-- =========================================================

create or replace function public.handle_new_user()
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
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            split_part(
                coalesce(new.email, ''),
                '@',
                1
            )
        ),

        new.email,

        'user'
    )

    on conflict (id)
    do update set
        email = excluded.email;

    return new;

end;
$$;

-- =========================================================
-- TRIGGER AUTH.USERS -> PROFILES
-- =========================================================

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created

after insert
on auth.users

for each row

execute function public.handle_new_user();

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
        raw_user_meta_data ->> 'full_name',
        raw_user_meta_data ->> 'name',
        split_part(
            coalesce(email, ''),
            '@',
            1
        )
    ),

    email,

    'user'

from auth.users

on conflict (id)
do update set
    email = excluded.email;

-- =========================================================
-- DEFINIR ADMIN
-- =========================================================

update public.profiles

set
    role = 'admin',
    updated_at = now()

where lower(email) =
      lower('dalcinryan0123@gmail.com');

-- =========================================================
-- FUNÇÃO: CURRENT ROLE
-- =========================================================

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$

    select coalesce(
        (
            select p.role
            from public.profiles p
            where p.id = auth.uid()
        ),
        'user'
    );

$$;

-- =========================================================
-- FUNÇÃO: IS ADMIN
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select public.current_role() = 'admin';

$$;

-- =========================================================
-- FUNÇÃO: IS MONITOR
-- =========================================================

create or replace function public.is_monitor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select public.current_role() = 'monitor';

$$;

-- =========================================================
-- FUNÇÃO: MONITOR DE DETERMINADO USUÁRIO
-- =========================================================

create or replace function public.is_monitor_of(
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

        where ma.monitor_id = auth.uid()

        and ma.user_id = target_user
    );

$$;

-- =========================================================
-- FUNÇÃO: PODE ACESSAR USUÁRIO
-- =========================================================

create or replace function public.can_access_user(
    target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select

        target_user = auth.uid()

        or public.is_admin()

        or (
            public.is_monitor()
            and public.is_monitor_of(target_user)
        );

$$;

-- =========================================================
-- FUNÇÃO: PODE ALTERAR USUÁRIO
-- =========================================================

create or replace function public.can_manage_user(
    target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select

        public.is_admin()

        or target_user = auth.uid();

$$;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.workouts
enable row level security;

alter table public.exercises
enable row level security;

alter table public.monitor_assignments
enable row level security;

alter table public.load_history
enable row level security;

-- =========================================================
-- REMOVER POLICIES ANTIGAS
-- =========================================================

drop policy if exists profiles_select
on public.profiles;

drop policy if exists profiles_update
on public.profiles;

drop policy if exists profiles_delete
on public.profiles;

drop policy if exists profiles_insert
on public.profiles;

drop policy if exists workouts_select
on public.workouts;

drop policy if exists workouts_insert
on public.workouts;

drop policy if exists workouts_update
on public.workouts;

drop policy if exists workouts_delete
on public.workouts;

drop policy if exists exercises_select
on public.exercises;

drop policy if exists exercises_insert
on public.exercises;

drop policy if exists exercises_update
on public.exercises;

drop policy if exists exercises_delete
on public.exercises;

drop policy if exists assignments_select
on public.monitor_assignments;

drop policy if exists assignments_insert
on public.monitor_assignments;

drop policy if exists assignments_update
on public.monitor_assignments;

drop policy if exists assignments_delete
on public.monitor_assignments;

drop policy if exists load_history_select
on public.load_history;

drop policy if exists load_history_insert
on public.load_history;

drop policy if exists load_history_update
on public.load_history;

drop policy if exists load_history_delete
on public.load_history;

-- =========================================================
-- PROFILES
-- =========================================================

create policy profiles_select

on public.profiles

for select

to authenticated

using (

    id = auth.uid()

    or public.is_admin()

    or public.is_monitor_of(id)

);

-- Usuário pode alterar apenas seus dados básicos.
-- Não pode alterar o próprio role.

create policy profiles_update

on public.profiles

for update

to authenticated

using (

    public.is_admin()

    or id = auth.uid()

)

with check (

    public.is_admin()

    or (
        id = auth.uid()
        and role = public.current_role()
    )

);

create policy profiles_delete

on public.profiles

for delete

to authenticated

using (
    public.is_admin()
);

-- =========================================================
-- MONITOR ASSIGNMENTS
-- =========================================================

create policy assignments_select

on public.monitor_assignments

for select

to authenticated

using (

    public.is_admin()

    or monitor_id = auth.uid()

    or user_id = auth.uid()

);

create policy assignments_insert

on public.monitor_assignments

for insert

to authenticated

with check (

    public.is_admin()

);

create policy assignments_update

on public.monitor_assignments

for update

to authenticated

using (

    public.is_admin()

)
with check (

    public.is_admin()

);

create policy assignments_delete

on public.monitor_assignments

for delete

to authenticated

using (

    public.is_admin()

);

-- =========================================================
-- WORKOUTS
-- =========================================================

create policy workouts_select

on public.workouts

for select

to authenticated

using (

    public.can_access_user(user_id)

);

create policy workouts_insert

on public.workouts

for insert

to authenticated

with check (

    public.can_access_user(user_id)

);

create policy workouts_update

on public.workouts

for update

to authenticated

using (

    public.can_access_user(user_id)

)

with check (

    public.can_access_user(user_id)

);

create policy workouts_delete

on public.workouts

for delete

to authenticated

using (

    public.can_access_user(user_id)

);

-- =========================================================
-- EXERCISES
-- =========================================================

create policy exercises_select

on public.exercises

for select

to authenticated

using (

    exists (

        select 1

        from public.workouts w

        where w.id = exercises.workout_id

        and public.can_access_user(w.user_id)

    )

);

create policy exercises_insert

on public.exercises

for insert

to authenticated

with check (

    exists (

        select 1

        from public.workouts w

        where w.id = exercises.workout_id

        and public.can_access_user(w.user_id)

    )

);

create policy exercises_update

on public.exercises

for update

to authenticated

using (

    exists (

        select 1

        from public.workouts w

        where w.id = exercises.workout_id

        and public.can_access_user(w.user_id)

    )

)

with check (

    exists (

        select 1

        from public.workouts w

        where w.id = exercises.workout_id

        and public.can_access_user(w.user_id)

    )

);

create policy exercises_delete

on public.exercises

for delete

to authenticated

using (

    exists (

        select 1

        from public.workouts w

        where w.id = exercises.workout_id

        and public.can_access_user(w.user_id)

    )

);

-- =========================================================
-- LOAD HISTORY
-- =========================================================

create policy load_history_select

on public.load_history

for select

to authenticated

using (

    public.can_access_user(user_id)

);

create policy load_history_insert

on public.load_history

for insert

to authenticated

with check (

    public.can_access_user(user_id)

    and (
        recorded_by = auth.uid()
        or recorded_by is null
    )

);

create policy load_history_update

on public.load_history

for update

to authenticated

using (

    public.can_access_user(user_id)

)

with check (

    public.can_access_user(user_id)

);

create policy load_history_delete

on public.load_history

for delete

to authenticated

using (

    public.is_admin()

    or recorded_by = auth.uid()

);

-- =========================================================
-- PERMISSÕES DAS FUNÇÕES
-- =========================================================

revoke all
on function public.current_role()
from public;

revoke all
on function public.is_admin()
from public;

revoke all
on function public.is_monitor()
from public;

revoke all
on function public.is_monitor_of(uuid)
from public;

revoke all
on function public.can_access_user(uuid)
from public;

revoke all
on function public.can_manage_user(uuid)
from public;

grant execute
on function public.current_role()
to authenticated;

grant execute
on function public.is_admin()
to authenticated;

grant execute
on function public.is_monitor()
to authenticated;

grant execute
on function public.is_monitor_of(uuid)
to authenticated;

grant execute
on function public.can_access_user(uuid)
to authenticated;

grant execute
on function public.can_manage_user(uuid)
to authenticated;

-- =========================================================
-- VERIFICAÇÃO
-- =========================================================

select
    id,
    email,
    display_name,
    role,
    created_at
from public.profiles
order by email;
