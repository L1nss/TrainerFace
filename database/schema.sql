-- ============================================================
-- TRAINER FACE — SCHEMA COMPLETO E COMPATÍVEL COM BANCO ANTIGO
--
-- Esta versão evita ENUM para "role" de propósito.
-- Isso reduz conflitos de migração entre TEXT e app_role.
--
-- Perfis:
--   ADMIN   = vê todos os alunos, treinos e progressão
--   MONITOR = vê apenas alunos vinculados, treinos e progressão
--   USER    = vê/edita apenas os próprios dados
--
-- ADMIN principal:
--   dalcinryan0123@gmail.com
--
-- Execute TODO este arquivo no SQL Editor do Supabase.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Remove CHECKs antigos que possam depender do tipo anterior de role.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', c.conname);
  end loop;
end
$$;

-- Converte role antigo (inclusive ENUM) para TEXT com segurança.
do $$
declare
  role_type text;
begin
  select c.data_type
  into role_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'role';

  if role_type is null then
    alter table public.profiles add column role text;
  elsif role_type <> 'text' then
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role drop not null;
    alter table public.profiles alter column role type text using role::text;
  end if;
end
$$;

update public.profiles
set role = upper(coalesce(nullif(trim(role), ''), 'USER'));

update public.profiles
set role = 'USER'
where role not in ('ADMIN', 'MONITOR', 'USER');

alter table public.profiles alter column role set default 'USER';
alter table public.profiles alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('ADMIN', 'MONITOR', 'USER'));

create index if not exists profiles_email_lower_idx
on public.profiles(lower(email))
where email is not null;

-- ============================================================
-- 2. WORKOUTS
-- ============================================================

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  workout_date date,
  weekday integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.workouts add column if not exists workout_date date;
alter table public.workouts add column if not exists weekday integer;
alter table public.workouts add column if not exists notes text;
alter table public.workouts add column if not exists created_at timestamptz default now();

-- Bancos antigos exigiam workout_date; o front novo usa weekday.
alter table public.workouts alter column workout_date drop not null;

update public.workouts
set weekday = extract(dow from workout_date)::integer
where weekday is null
  and workout_date is not null;

alter table public.workouts
  drop constraint if exists workouts_weekday_check;

alter table public.workouts
  add constraint workouts_weekday_check
  check (weekday is null or weekday between 0 and 6);

-- ============================================================
-- 3. EXERCISES
-- ============================================================

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

alter table public.exercises add column if not exists sets integer;
alter table public.exercises add column if not exists reps text;
alter table public.exercises add column if not exists weight numeric(10,2);
alter table public.exercises add column if not exists notes text;
alter table public.exercises add column if not exists position integer default 0;

-- Compatibilidade: reps pode ter sido INTEGER/NUMERIC.
do $$
declare
  reps_type text;
begin
  select c.data_type
  into reps_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'exercises'
    and c.column_name = 'reps';

  if reps_type is not null and reps_type <> 'text' then
    alter table public.exercises
      alter column reps type text
      using reps::text;
  end if;
end
$$;

update public.exercises set position = 0 where position is null;
alter table public.exercises alter column position set default 0;
alter table public.exercises alter column position set not null;

-- ============================================================
-- 4. MONITOR_STUDENTS
-- ============================================================

create table if not exists public.monitor_students (
  monitor_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (monitor_id, student_id)
);

alter table public.monitor_students
  drop constraint if exists monitor_student_different;

alter table public.monitor_students
  add constraint monitor_student_different
  check (monitor_id <> student_id);

-- ============================================================
-- 5. WORKOUT_PROGRESS
-- ============================================================

create table if not exists public.workout_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  exercise_name text not null,
  weight numeric(10,2) not null,
  reps text,
  sets integer,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.workout_progress add column if not exists workout_id uuid;
alter table public.workout_progress add column if not exists exercise_name text;
alter table public.workout_progress add column if not exists weight numeric(10,2);
alter table public.workout_progress add column if not exists reps text;
alter table public.workout_progress add column if not exists sets integer;
alter table public.workout_progress add column if not exists recorded_at timestamptz default now();
alter table public.workout_progress add column if not exists created_at timestamptz default now();

-- Reps também fica TEXT aqui para aceitar bases antigas e valores variados.
do $$
declare
  reps_type text;
begin
  select c.data_type
  into reps_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'workout_progress'
    and c.column_name = 'reps';

  if reps_type is not null and reps_type <> 'text' then
    alter table public.workout_progress
      alter column reps type text
      using reps::text;
  end if;
end
$$;

-- ============================================================
-- 6. DIET_PLANS
-- ============================================================

create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  objective text not null default 'rotina_equilibrada',
  preferences text,
  restrictions text,
  meals_per_day integer not null default 4,
  plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diet_plans add column if not exists objective text default 'rotina_equilibrada';
alter table public.diet_plans add column if not exists preferences text;
alter table public.diet_plans add column if not exists restrictions text;
alter table public.diet_plans add column if not exists meals_per_day integer default 4;
alter table public.diet_plans add column if not exists plan jsonb default '[]'::jsonb;
alter table public.diet_plans add column if not exists created_at timestamptz default now();
alter table public.diet_plans add column if not exists updated_at timestamptz default now();

update public.diet_plans
set meals_per_day = 4
where meals_per_day is null or meals_per_day not between 3 and 6;

alter table public.diet_plans
  drop constraint if exists diet_plans_meals_per_day_check;

alter table public.diet_plans
  add constraint diet_plans_meals_per_day_check
  check (meals_per_day between 3 and 6);

-- ============================================================
-- 7. LIMPEZA DE POLÍTICAS/FUNÇÕES DE VERSÕES ANTERIORES
--
-- Necessário porque versões anteriores podem ter criado
-- current_user_role() retornando app_role. PostgreSQL não aceita
-- alterar o tipo de retorno usando CREATE OR REPLACE.
-- ============================================================

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'monitor_students',
        'workouts',
        'exercises',
        'workout_progress',
        'diet_plans'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  end loop;
end
$$;

drop function if exists public.can_view_student(uuid);
drop function if exists public.current_user_role();

-- ============================================================
-- 8. FUNÇÃO: ROLE DO USUÁRIO ATUAL
-- ============================================================

create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when lower(coalesce(auth.jwt() ->> 'email', '')) =
           'dalcinryan0123@gmail.com'
        then 'ADMIN'
      else coalesce(
        (
          select p.role
          from public.profiles p
          where p.id = auth.uid()
          limit 1
        ),
        'USER'
      )
    end;
$$;

-- ============================================================
-- 9. FUNÇÃO: PODE VER O ALUNO?
-- ============================================================

create or replace function public.can_view_student(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_user
    or public.current_user_role() = 'ADMIN'
    or (
      public.current_user_role() = 'MONITOR'
      and exists (
        select 1
        from public.monitor_students ms
        where ms.monitor_id = auth.uid()
          and ms.student_id = target_user
      )
    );
$$;

-- ============================================================
-- 10. CRIAR/ATUALIZAR PERFIL AUTOMATICAMENTE
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    lower(new.email),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'aluno'), '@', 1)
    ),
    case
      when lower(coalesce(new.email, '')) =
           'dalcinryan0123@gmail.com'
        then 'ADMIN'
      else 'USER'
    end
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email
on auth.users
for each row
execute function public.handle_new_user();

-- ============================================================
-- 11. IMPORTAR USUÁRIOS EXISTENTES DO AUTH
-- ============================================================

insert into public.profiles (
  id,
  email,
  full_name,
  role
)
select
  u.id,
  lower(u.email),
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(u.email, 'aluno'), '@', 1)
  ),
  case
    when lower(coalesce(u.email, '')) =
         'dalcinryan0123@gmail.com'
      then 'ADMIN'
    else 'USER'
  end
from auth.users u
on conflict (id)
do update set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

update public.profiles
set role = 'ADMIN'
where lower(email) = 'dalcinryan0123@gmail.com';

-- ============================================================
-- 12. PROTEGER ROLE E EMAIL
-- ============================================================

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- O ADMIN principal nunca pode ser rebaixado.
  if lower(coalesce(old.email, '')) = 'dalcinryan0123@gmail.com' then
    new.role := 'ADMIN';
  end if;

  -- Somente ADMIN pode mudar role.
  if new.role is distinct from old.role
     and public.current_user_role() <> 'ADMIN'
  then
    raise exception 'Somente ADMIN pode alterar a função de um usuário.';
  end if;

  -- Email é controlado pelo Auth; somente ADMIN pode alterar por SQL/API.
  if new.email is distinct from old.email
     and public.current_user_role() <> 'ADMIN'
  then
    raise exception 'O email deve ser alterado pelo sistema de autenticação.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields_trigger
on public.profiles;

create trigger protect_profile_security_fields_trigger
before update
on public.profiles
for each row
execute function public.protect_profile_security_fields();

-- ============================================================
-- 13. VALIDAR VÍNCULO MONITOR -> ALUNO
-- ============================================================

create or replace function public.validate_monitor_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.monitor_id
      and role = 'MONITOR'
  ) then
    raise exception 'O usuário escolhido não possui função MONITOR.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.student_id
      and role = 'USER'
  ) then
    raise exception 'O aluno escolhido não possui função USER.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_monitor_student_trigger
on public.monitor_students;

create trigger validate_monitor_student_trigger
before insert or update
on public.monitor_students
for each row
execute function public.validate_monitor_student();

-- ============================================================
-- 14. UPDATED_AT
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists diet_plans_updated_at_trigger
on public.diet_plans;

create trigger diet_plans_updated_at_trigger
before update
on public.diet_plans
for each row
execute function public.set_updated_at();

-- ============================================================
-- 15. RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.monitor_students enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_progress enable row level security;
alter table public.diet_plans enable row level security;

-- Políticas antigas já foram removidas antes da recriação
-- das funções de autorização.

-- ============================================================
-- 16. PROFILES POLICIES
-- ============================================================

create policy profiles_select_policy
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.current_user_role() = 'ADMIN'
  or (
    public.current_user_role() = 'MONITOR'
    and exists (
      select 1
      from public.monitor_students ms
      where ms.monitor_id = auth.uid()
        and ms.student_id = profiles.id
    )
  )
);

create policy profiles_update_policy
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
  or public.current_user_role() = 'ADMIN'
)
with check (
  auth.uid() = id
  or public.current_user_role() = 'ADMIN'
);

-- ============================================================
-- 17. MONITOR_STUDENTS POLICIES
-- ============================================================

create policy monitor_students_select_policy
on public.monitor_students
for select
to authenticated
using (
  public.current_user_role() = 'ADMIN'
  or monitor_id = auth.uid()
);

create policy monitor_students_insert_policy
on public.monitor_students
for insert
to authenticated
with check (
  public.current_user_role() = 'ADMIN'
);

create policy monitor_students_update_policy
on public.monitor_students
for update
to authenticated
using (
  public.current_user_role() = 'ADMIN'
)
with check (
  public.current_user_role() = 'ADMIN'
);

create policy monitor_students_delete_policy
on public.monitor_students
for delete
to authenticated
using (
  public.current_user_role() = 'ADMIN'
);

-- ============================================================
-- 18. WORKOUTS POLICIES
-- ============================================================

create policy workouts_select_policy
on public.workouts
for select
to authenticated
using (
  public.can_view_student(user_id)
);

-- USER só grava o próprio treino.
-- MONITOR é somente leitura.
-- ADMIN também fica somente leitura de treino pelo front atual.
create policy workouts_insert_policy
on public.workouts
for insert
to authenticated
with check (
  user_id = auth.uid()
);

create policy workouts_update_policy
on public.workouts
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

create policy workouts_delete_policy
on public.workouts
for delete
to authenticated
using (
  user_id = auth.uid()
);

-- ============================================================
-- 19. EXERCISES POLICIES
-- ============================================================

create policy exercises_select_policy
on public.exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and public.can_view_student(w.user_id)
  )
);

create policy exercises_insert_policy
on public.exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
);

create policy exercises_update_policy
on public.exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
);

create policy exercises_delete_policy
on public.exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
);

-- ============================================================
-- 20. WORKOUT_PROGRESS POLICIES
-- ============================================================

create policy workout_progress_select_policy
on public.workout_progress
for select
to authenticated
using (
  public.can_view_student(user_id)
);

create policy workout_progress_insert_policy
on public.workout_progress
for insert
to authenticated
with check (
  user_id = auth.uid()
);

create policy workout_progress_update_policy
on public.workout_progress
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

create policy workout_progress_delete_policy
on public.workout_progress
for delete
to authenticated
using (
  user_id = auth.uid()
);

-- ============================================================
-- 21. DIET_PLANS POLICIES
--
-- USER: própria dieta
-- ADMIN: pode visualizar todas
-- MONITOR: não visualiza dietas
-- ============================================================

create policy diet_plans_select_policy
on public.diet_plans
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'ADMIN'
);

create policy diet_plans_insert_policy
on public.diet_plans
for insert
to authenticated
with check (
  user_id = auth.uid()
);

create policy diet_plans_update_policy
on public.diet_plans
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

create policy diet_plans_delete_policy
on public.diet_plans
for delete
to authenticated
using (
  user_id = auth.uid()
);

-- ============================================================
-- 22. PERMISSÕES
-- ============================================================

grant usage on schema public to authenticated;

grant select, update
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.monitor_students
to authenticated;

grant select, insert, update, delete
on public.workouts
to authenticated;

grant select, insert, update, delete
on public.exercises
to authenticated;

grant select, insert, update, delete
on public.workout_progress
to authenticated;

grant select, insert, update, delete
on public.diet_plans
to authenticated;

grant execute
on function public.current_user_role()
to authenticated;

grant execute
on function public.can_view_student(uuid)
to authenticated;

-- ============================================================
-- 23. ÍNDICES
-- ============================================================

create index if not exists workouts_user_weekday_idx
on public.workouts(user_id, weekday);

create index if not exists exercises_workout_idx
on public.exercises(workout_id);

create index if not exists monitor_students_monitor_idx
on public.monitor_students(monitor_id);

create index if not exists monitor_students_student_idx
on public.monitor_students(student_id);

create index if not exists workout_progress_user_exercise_date_idx
on public.workout_progress(user_id, exercise_name, recorded_at);

create index if not exists diet_plans_user_created_idx
on public.diet_plans(user_id, created_at desc);

-- ============================================================
-- 24. GARANTIR ADMIN PRINCIPAL NO FINAL
-- ============================================================

update public.profiles
set role = 'ADMIN',
    updated_at = now()
where lower(email) = 'dalcinryan0123@gmail.com';

commit;

-- ============================================================
-- 25. TESTES DE VERIFICAÇÃO
-- ============================================================

select
  id,
  email,
  full_name,
  role,
  created_at
from public.profiles
order by
  case role
    when 'ADMIN' then 1
    when 'MONITOR' then 2
    else 3
  end,
  email;