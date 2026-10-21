-- Phase 1 foundation schema: roles, permissions, users, profiles, sessions.
-- Future modules (appointments, tasks, notes, ...) add their own numbered
-- migration files (002_..., 003_...) and reference users(id).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- Shared trigger to keep updated_at current on any table that has the column.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- roles
CREATE TABLE roles (
  id          SMALLSERIAL PRIMARY KEY,
  name        VARCHAR(30)  NOT NULL UNIQUE CHECK (name IN ('client', 'staff', 'admin')),
  description VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------- permissions
CREATE TABLE permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(80) NOT NULL UNIQUE,   -- e.g. 'dashboard:client'
  description VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id       SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT      NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id       SMALLINT     NOT NULL REFERENCES roles(id),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Case-insensitive unique email
CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));
CREATE INDEX users_role_id_idx ON users (role_id);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------- profiles
-- One profile per user (basic profile fields; extend later as needed).
CREATE TABLE profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  phone          VARCHAR(30),
  date_of_birth  DATE,
  address_line1  VARCHAR(255),
  address_line2  VARCHAR(255),
  city           VARCHAR(100),
  state          VARCHAR(100),
  postal_code    VARCHAR(20),
  country        VARCHAR(100),
  avatar_url     VARCHAR(500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------- sessions
-- Server-side refresh sessions. Only a SHA-256 hash of the token is stored.
CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64)    NOT NULL UNIQUE,
  user_agent         VARCHAR(500),
  ip_address         VARCHAR(64),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
