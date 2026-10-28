-- Milestone 2: HR recruitment, caregivers, clients, care plans, scheduling, email outbox.

CREATE EXTENSION IF NOT EXISTS btree_gist; -- needed for the no-double-booking constraint

-- ---------------------------------------------------------------- HR role
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ('client', 'staff', 'admin', 'hr'));

-- ------------------------------------------------------------ applicants
CREATE TABLE applicants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  phone            VARCHAR(30)  NOT NULL,
  profession       VARCHAR(10)  NOT NULL CHECK (profession IN ('RN', 'RPN', 'PSW', 'RSW')),
  license_number   VARCHAR(100),
  years_experience SMALLINT CHECK (years_experience BETWEEN 0 AND 60),
  city             VARCHAR(100),
  region           VARCHAR(100),
  cover_note       TEXT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'applied'
                   CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  rejection_reason TEXT,                       -- internal only, never emailed
  hired_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One live application per person per profession (a rejected/hired one does not block re-applying).
CREATE UNIQUE INDEX applicants_active_email_profession_uidx
  ON applicants (LOWER(email), profession) WHERE status NOT IN ('rejected', 'hired');
CREATE INDEX applicants_status_idx ON applicants (status);
CREATE INDEX applicants_profession_idx ON applicants (profession);
CREATE INDEX applicants_created_at_idx ON applicants (created_at DESC);
CREATE TRIGGER applicants_set_updated_at
  BEFORE UPDATE ON applicants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE applicant_status_history (
  id           BIGSERIAL PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  from_status  VARCHAR(20),
  to_status    VARCHAR(20) NOT NULL,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX applicant_status_history_applicant_idx ON applicant_status_history (applicant_id, created_at);

CREATE TABLE applicant_notes (
  id           BIGSERIAL PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX applicant_notes_applicant_idx ON applicant_notes (applicant_id, created_at);

-- ------------------------------------------------------------- documents
-- Metadata only. The file itself lives in private storage under storage_key.
-- A document belongs to an applicant and/or (after hiring) a caregiver user.
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID REFERENCES applicants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  doc_type      VARCHAR(30) NOT NULL
                CHECK (doc_type IN ('resume', 'cpr_first_aid', 'police_check', 'certification', 'government_id', 'other')),
  original_name VARCHAR(255) NOT NULL,
  storage_key   VARCHAR(255) NOT NULL UNIQUE,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (applicant_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE INDEX documents_applicant_idx ON documents (applicant_id);
CREATE INDEX documents_user_idx ON documents (user_id);

-- ------------------------------------------------------ caregiver profiles
-- Extra data for users with the "staff" role who were hired through recruitment.
CREATE TABLE caregiver_profiles (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  applicant_id            UUID REFERENCES applicants(id) ON DELETE SET NULL,
  profession              VARCHAR(10) NOT NULL CHECK (profession IN ('RN', 'RPN', 'PSW', 'RSW')),
  license_body            VARCHAR(100),          -- e.g. the regulatory college
  license_number          VARCHAR(100),
  license_expiry          DATE,
  hire_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  employment_status       VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (employment_status IN ('active', 'on_leave', 'inactive')),
  emergency_contact_name  VARCHAR(150),
  emergency_contact_phone VARCHAR(30),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX caregiver_profiles_status_idx ON caregiver_profiles (employment_status);
CREATE TRIGGER caregiver_profiles_set_updated_at
  BEFORE UPDATE ON caregiver_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Weekly availability: any number of time windows per weekday (0 = Sunday ... 6 = Saturday).
CREATE TABLE caregiver_availability (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES caregiver_profiles(user_id) ON DELETE CASCADE,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX caregiver_availability_user_idx ON caregiver_availability (user_id, weekday);

-- Areas (cities, neighbourhoods, postal prefixes) a caregiver is willing to travel to.
CREATE TABLE caregiver_service_areas (
  id      BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES caregiver_profiles(user_id) ON DELETE CASCADE,
  name    VARCHAR(100) NOT NULL
);
CREATE UNIQUE INDEX caregiver_service_areas_uidx ON caregiver_service_areas (user_id, LOWER(name));

-- Certifications with their own expiry dates (e.g. CPR, dementia care), optionally tied to an uploaded file.
CREATE TABLE caregiver_certifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES caregiver_profiles(user_id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  issuer      VARCHAR(150),
  issued_on   DATE,
  expires_on  DATE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX caregiver_certifications_user_idx ON caregiver_certifications (user_id);
CREATE INDEX caregiver_certifications_expiry_idx ON caregiver_certifications (expires_on);

-- --------------------------------------------------------------- clients
-- A client record (the person receiving care). user_id links an optional login.
CREATE TABLE clients (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name              VARCHAR(100) NOT NULL,
  last_name               VARCHAR(100) NOT NULL,
  email                   VARCHAR(255),
  phone                   VARCHAR(30),
  date_of_birth           DATE,
  address_line1           VARCHAR(255),
  address_line2           VARCHAR(255),
  city                    VARCHAR(100),
  region                  VARCHAR(100),
  postal_code             VARCHAR(20),
  care_needs              TEXT,
  emergency_contact_name  VARCHAR(150),
  emergency_contact_phone VARCHAR(30),
  notes                   TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'inactive')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX clients_status_idx ON clients (status);
CREATE INDEX clients_name_idx ON clients (LOWER(last_name), LOWER(first_name));
CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A client has any number of care plans over time, but only ONE active at a time.
CREATE TABLE care_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  summary     TEXT,
  goals       TEXT,
  daily_tasks TEXT,
  precautions TEXT,
  start_date  DATE,
  review_date DATE,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX care_plans_one_active_uidx ON care_plans (client_id) WHERE status = 'active';
CREATE INDEX care_plans_client_idx ON care_plans (client_id, created_at DESC);
CREATE TRIGGER care_plans_set_updated_at
  BEFORE UPDATE ON care_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- visits
-- Created by Admin only. Caregivers can add notes and mark visits completed (no clock-in/out).
CREATE TABLE visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  caregiver_id  UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = not yet assigned
  service_type  VARCHAR(100) NOT NULL DEFAULT 'Personal care',
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')),
  instructions  TEXT,                -- written by Admin for the caregiver
  cancel_reason TEXT,
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);
CREATE INDEX visits_start_idx ON visits (start_at);
CREATE INDEX visits_caregiver_start_idx ON visits (caregiver_id, start_at);
CREATE INDEX visits_client_start_idx ON visits (client_id, start_at);
CREATE INDEX visits_status_idx ON visits (status);

-- The database itself refuses to double-book a caregiver: two scheduled (or completed)
-- visits for the same caregiver may not overlap in time (back-to-back is fine).
-- Cancelled and missed visits no longer block the slot.
ALTER TABLE visits ADD CONSTRAINT visits_no_caregiver_overlap
  EXCLUDE USING gist (caregiver_id WITH =, tstzrange(start_at, end_at) WITH &&)
  WHERE (caregiver_id IS NOT NULL AND status IN ('scheduled', 'completed'));

CREATE TRIGGER visits_set_updated_at
  BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Notes a caregiver writes about a visit (any number, each with author and time).
CREATE TABLE visit_notes (
  id         BIGSERIAL PRIMARY KEY,
  visit_id   UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX visit_notes_visit_idx ON visit_notes (visit_id, created_at);

-- ---------------------------------------------------- email outbox + tokens
-- Emails are first written here (inside the same transaction as the change that
-- caused them) and sent by a background worker, so a mail-server outage never
-- loses or blocks anything. dedupe_key stops the same email being queued twice.
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  to_email    VARCHAR(255) NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  kind        VARCHAR(40) NOT NULL,
  related_id  UUID,
  dedupe_key  VARCHAR(255) UNIQUE,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  TEXT,
  send_after  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_due_idx ON notifications (send_after) WHERE status = 'pending';
CREATE INDEX notifications_kind_idx ON notifications (kind, created_at DESC);

-- One-time "set your password" links (new caregiver invites). Only a hash is stored.
CREATE TABLE password_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  purpose    VARCHAR(10) NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX password_tokens_user_idx ON password_tokens (user_id);
