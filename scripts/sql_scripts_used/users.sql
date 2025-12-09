create table public.users (
    user_id uuid not null default gen_random_uuid (),
    email character varying(320) not null,
    username character varying(100) null,
    password_hash character varying(255) null,
    created_at timestamp without time zone not null default CURRENT_TIMESTAMP,
    last_modified timestamp without time zone not null default CURRENT_TIMESTAMP,
    last_login timestamp without time zone null,
    constraint users_pkey primary key (user_id),
    constraint users_email_unique unique (email)
) TABLESPACE pg_default;

create index if not exists users_username_idx on public.users (username);

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.last_modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
