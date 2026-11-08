-- ADBETA database schema. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 phone text,
 referral_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
 referred_by uuid references public.profiles(id),
 available_balance numeric(14,2) not null default 0 check (available_balance >= 0),
 total_earned numeric(14,2) not null default 0 check (total_earned >= 0),
 created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','member')) default 'member'
);
create table if not exists public.ad_campaigns (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 description text,
 reward_amount numeric(12,4) not null default 0.01 check(reward_amount > 0),
 duration_seconds integer not null default 15,
 active boolean not null default false,
 daily_limit integer not null default 1,
 created_at timestamptz not null default now()
);
create table if not exists public.activity_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 activity_type text not null,
 description text,
 amount numeric(14,2) not null default 0,
 status text not null default 'approved' check(status in ('pending','approved','rejected','reversed')),
 reference_id uuid,
 created_at timestamptz not null default now()
);
create table if not exists public.ad_completions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 ad_id uuid not null references public.ad_campaigns(id),
 completed_on date not null default current_date,
 created_at timestamptz not null default now(),
 unique(user_id,ad_id,completed_on)
);
create table if not exists public.daily_checkins (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 checkin_date date not null default current_date,
 created_at timestamptz not null default now(),
 unique(user_id,checkin_date)
);
create table if not exists public.story_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 platform text not null,
 url text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.withdrawal_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 amount numeric(14,2) not null check(amount > 0),
 method text not null check(method in ('M-Pesa','USDT BEP20')),
 destination text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','paid')),
 admin_note text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') $$;

-- New account setup. Referral is resolved from the optional referral code supplied at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare referrer uuid;
begin
 if new.raw_user_meta_data->>'referral_code' is not null then
   select id into referrer from public.profiles where referral_code=upper(new.raw_user_meta_data->>'referral_code');
 end if;
 insert into public.profiles(id,full_name,phone,referred_by)
 values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',referrer)
 on conflict(id) do nothing;
 insert into public.user_roles(user_id,role) values(new.id,'member') on conflict(user_id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Activity credit is performed only in trusted database functions, never from client-supplied amounts.
create or replace function public.claim_daily_checkin()
returns void language plpgsql security definer set search_path=public
as $$
declare reward numeric(14,2):=0.05;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 insert into public.daily_checkins(user_id) values(auth.uid());
 update public.profiles set available_balance=available_balance+reward,total_earned=total_earned+reward where id=auth.uid();
 insert into public.activity_ledger(user_id,activity_type,description,amount) values(auth.uid(),'checkin','Daily check-in',reward);
exception when unique_violation then raise exception 'You have already checked in today';
end $$;

create or replace function public.complete_ad_task(p_ad_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare ad public.ad_campaigns%rowtype;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 select * into ad from public.ad_campaigns where id=p_ad_id and active=true for update;
 if not found then raise exception 'Campaign is not available'; end if;
 insert into public.ad_completions(user_id,ad_id) values(auth.uid(),p_ad_id);
 update public.profiles set available_balance=available_balance+ad.reward_amount,total_earned=total_earned+ad.reward_amount where id=auth.uid();
 insert into public.activity_ledger(user_id,activity_type,description,amount,reference_id) values(auth.uid(),'ad_view',ad.title,ad.reward_amount,p_ad_id);
exception when unique_violation then raise exception 'You have already completed this campaign today';
end $$;

create or replace function public.admin_review_withdrawal(p_request_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
declare req public.withdrawal_requests%rowtype;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_status not in ('approved','rejected','paid') then raise exception 'Invalid status'; end if;
 select * into req from public.withdrawal_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;
 if req.status='pending' and p_status='rejected' then
   update public.profiles set available_balance=available_balance+req.amount where id=req.user_id;
 end if;
 update public.withdrawal_requests set status=p_status,reviewed_at=now() where id=p_request_id;
end $$;

-- Withdrawal requests reserve the amount immediately to prevent duplicate requests.
create or replace function public.reserve_withdrawal()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if new.user_id <> auth.uid() and not public.is_admin() then raise exception 'Invalid user'; end if;
 if new.method='M-Pesa' and new.destination !~ '^(\+?254|0)7[0-9]{8}$' and new.destination !~ '^(\+?254|0)1[0-9]{8}$' then raise exception 'Enter a valid Kenyan mobile number'; end if;
 if new.method='USDT BEP20' and new.destination !~ '^0x[a-fA-F0-9]{40}$' then raise exception 'Enter a valid BEP20 wallet address'; end if;
 update public.profiles set available_balance=available_balance-new.amount where id=new.user_id and available_balance>=new.amount;
 if not found then raise exception 'Insufficient available balance'; end if;
 return new;
end $$;
drop trigger if exists before_withdrawal_insert on public.withdrawal_requests;
create trigger before_withdrawal_insert before insert on public.withdrawal_requests for each row execute procedure public.reserve_withdrawal();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.activity_ledger enable row level security;
alter table public.ad_completions enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.story_submissions enable row level security;
alter table public.withdrawal_requests enable row level security;

create policy "read own profile or admin" on public.profiles for select using(id=auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "read own role" on public.user_roles for select using(user_id=auth.uid() or public.is_admin());
create policy "active campaigns visible" on public.ad_campaigns for select using(active=true or public.is_admin());
create policy "admins manage campaigns" on public.ad_campaigns for all using(public.is_admin()) with check(public.is_admin());
create policy "read own ledger" on public.activity_ledger for select using(user_id=auth.uid() or public.is_admin());
create policy "read own completions" on public.ad_completions for select using(user_id=auth.uid() or public.is_admin());
create policy "read own checkins" on public.daily_checkins for select using(user_id=auth.uid() or public.is_admin());
create policy "insert own story" on public.story_submissions for insert with check(user_id=auth.uid());
create policy "read own stories or admin" on public.story_submissions for select using(user_id=auth.uid() or public.is_admin());
create policy "admin reviews stories" on public.story_submissions for update using(public.is_admin()) with check(public.is_admin());
create policy "read own withdrawals or admin" on public.withdrawal_requests for select using(user_id=auth.uid() or public.is_admin());
create policy "insert own withdrawal" on public.withdrawal_requests for insert with check(user_id=auth.uid());

-- After creating your first account, promote it with:
-- update public.user_roles set role='admin' where user_id='YOUR_AUTH_USER_UUID';
-- Configure reward amounts, limits, advertiser consent and local compliance before going live.


-- M-Pesa STK collection records. This is separate from member reward withdrawals.
create table if not exists public.mpesa_payments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 phone text not null,
 amount_kes integer not null check(amount_kes>0),
 merchant_request_id text,
 checkout_request_id text unique,
 receipt_number text,
 result_description text,
 status text not null default 'pending' check(status in ('pending','paid','failed')),
 created_at timestamptz not null default now()
);
alter table public.mpesa_payments enable row level security;
create policy "read own mpesa payments or admin" on public.mpesa_payments for select using(user_id=auth.uid() or public.is_admin());


-- Prevent members from changing reward balances, referral attribution or account IDs directly.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is not null and not public.is_admin() then
   if new.id <> old.id
      or new.available_balance <> old.available_balance
      or new.total_earned <> old.total_earned
      or new.referred_by is distinct from old.referred_by
      or new.referral_code <> old.referral_code then
     raise exception 'Protected account fields cannot be edited';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists protect_profile_fields_trigger on public.profiles;
create trigger protect_profile_fields_trigger before update on public.profiles
for each row execute procedure public.protect_profile_fields();
