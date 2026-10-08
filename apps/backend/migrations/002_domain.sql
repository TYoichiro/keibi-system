CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE officers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','leave','retired')),
  business_phone text, business_email text, employment_type text, service_area text, internal_memo text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id,id), UNIQUE (company_id,branch_id,id), UNIQUE(company_id,code),
  FOREIGN KEY (company_id,branch_id) REFERENCES branches(company_id,id)
);
ALTER TABLE memberships ADD CONSTRAINT membership_officer_company_branch_fk
  FOREIGN KEY (company_id,branch_id,officer_id) REFERENCES officers(company_id,branch_id,id);
CREATE UNIQUE INDEX membership_officer_unique ON memberships(company_id,officer_id) WHERE officer_id IS NOT NULL;

CREATE TABLE qualifications (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), code text NOT NULL,
  name text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  version integer NOT NULL DEFAULT 1, UNIQUE(company_id,id), UNIQUE(company_id,code)
);
CREATE TABLE officer_qualifications (
  company_id uuid NOT NULL, officer_id uuid NOT NULL, qualification_id uuid NOT NULL,
  verification_status text NOT NULL CHECK(verification_status IN ('unverified','verified','invalid')),
  valid_from date, valid_through date, verified_by uuid REFERENCES app_users(id), verified_at timestamptz,
  PRIMARY KEY(company_id,officer_id,qualification_id),
  FOREIGN KEY(company_id,officer_id) REFERENCES officers(company_id,id),
  FOREIGN KEY(company_id,qualification_id) REFERENCES qualifications(company_id,id),
  CHECK(valid_from IS NULL OR valid_through IS NULL OR valid_from <= valid_through)
);
CREATE TABLE clients (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), code text NOT NULL, name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  contact_name text, business_phone text, business_email text, version integer NOT NULL DEFAULT 1,
  UNIQUE(company_id,id), UNIQUE(company_id,code)
);
CREATE TABLE client_branch_access (
  company_id uuid NOT NULL, client_id uuid NOT NULL, branch_id uuid NOT NULL,
  PRIMARY KEY(company_id,client_id,branch_id),
  FOREIGN KEY(company_id,client_id) REFERENCES clients(company_id,id),
  FOREIGN KEY(company_id,branch_id) REFERENCES branches(company_id,id)
);
CREATE TABLE sites (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), branch_id uuid NOT NULL, client_id uuid NOT NULL,
  code text NOT NULL, name text NOT NULL, security_type text NOT NULL CHECK(security_type IN ('traffic','facility')),
  location text NOT NULL, meeting_point text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','paused','closed')),
  instructions text NOT NULL DEFAULT '', internal_memo text, contact_name text, business_phone text,
  contract_from date, contract_through date, version integer NOT NULL DEFAULT 1,
  UNIQUE(company_id,id), UNIQUE(company_id,branch_id,id), UNIQUE(company_id,code),
  FOREIGN KEY(company_id,branch_id) REFERENCES branches(company_id,id),
  FOREIGN KEY(company_id,client_id,branch_id) REFERENCES client_branch_access(company_id,client_id,branch_id),
  CHECK((contract_from IS NULL AND contract_through IS NULL) OR
    (contract_from IS NOT NULL AND contract_through IS NOT NULL AND contract_from <= contract_through))
);
CREATE TABLE duty_slots (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), branch_id uuid NOT NULL, site_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','cancelled')),
  version integer NOT NULL DEFAULT 1, draft_version_id uuid, published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), UNIQUE(company_id,branch_id,id),
  FOREIGN KEY(company_id,branch_id,site_id) REFERENCES sites(company_id,branch_id,id)
);
CREATE TABLE duty_revisions (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, slot_id uuid NOT NULL, number integer NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','superseded','cancelled','discarded')),
  duty_date date NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  required_count integer NOT NULL CHECK(required_count BETWEEN 1 AND 1000),
  site_snapshot jsonb NOT NULL, availability_check jsonb NOT NULL, travel_rest_check jsonb NOT NULL,
  reason text NOT NULL DEFAULT '', confirmed_at timestamptz, confirmed_by uuid REFERENCES app_users(id),
  UNIQUE(company_id,id), UNIQUE(company_id,slot_id,id), UNIQUE(company_id,slot_id,number),
  FOREIGN KEY(company_id,slot_id) REFERENCES duty_slots(company_id,id),
  CHECK(ends_at > starts_at), CHECK(duty_date = (starts_at AT TIME ZONE 'Asia/Tokyo')::date)
);
ALTER TABLE duty_slots ADD CONSTRAINT slot_draft_revision_fk
  FOREIGN KEY(company_id,id,draft_version_id) REFERENCES duty_revisions(company_id,slot_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE duty_slots ADD CONSTRAINT slot_published_revision_fk
  FOREIGN KEY(company_id,id,published_version_id) REFERENCES duty_revisions(company_id,slot_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX one_draft_revision ON duty_revisions(company_id,slot_id) WHERE state = 'draft';
CREATE UNIQUE INDEX one_published_revision ON duty_revisions(company_id,slot_id) WHERE state = 'published';
CREATE TABLE duty_assignments (
  company_id uuid NOT NULL, revision_id uuid NOT NULL, officer_id uuid NOT NULL, is_leader boolean NOT NULL,
  officer_name text NOT NULL,
  PRIMARY KEY(company_id,revision_id,officer_id),
  FOREIGN KEY(company_id,revision_id) REFERENCES duty_revisions(company_id,id),
  FOREIGN KEY(company_id,officer_id) REFERENCES officers(company_id,id)
);
CREATE TABLE duty_qualification_requirements (
  company_id uuid NOT NULL, revision_id uuid NOT NULL, qualification_id uuid NOT NULL,
  required_qualified_count integer NOT NULL CHECK(required_qualified_count BETWEEN 1 AND 1000),
  PRIMARY KEY(company_id,revision_id,qualification_id),
  FOREIGN KEY(company_id,revision_id) REFERENCES duty_revisions(company_id,id),
  FOREIGN KEY(company_id,qualification_id) REFERENCES qualifications(company_id,id)
);
CREATE TABLE officer_reservations (
  company_id uuid NOT NULL, slot_id uuid NOT NULL, revision_id uuid NOT NULL, officer_id uuid NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  PRIMARY KEY(company_id,slot_id,officer_id),
  FOREIGN KEY(company_id,slot_id,revision_id) REFERENCES duty_revisions(company_id,slot_id,id),
  FOREIGN KEY(company_id,revision_id,officer_id) REFERENCES duty_assignments(company_id,revision_id,officer_id),
  CHECK(ends_at > starts_at),
  EXCLUDE USING gist(company_id WITH =,officer_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE INDEX reservation_slot ON officer_reservations(company_id,slot_id);
CREATE INDEX revision_dates ON duty_revisions(company_id,duty_date);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), branch_id uuid,
  actor_id uuid NOT NULL REFERENCES app_users(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
  action text NOT NULL, reason text NOT NULL DEFAULT '', before_data jsonb, after_data jsonb,
  request_id text NOT NULL, created_at timestamptz NOT NULL,
  FOREIGN KEY(company_id,branch_id) REFERENCES branches(company_id,id)
);
CREATE TABLE idempotency_records (
  company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL REFERENCES app_users(id), key uuid NOT NULL,
  request_hash text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, branch_id uuid,
  operation text NOT NULL, result jsonb NOT NULL, http_status integer NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(company_id,actor_id,key), FOREIGN KEY(company_id,branch_id) REFERENCES branches(company_id,id)
);

-- Reservations must describe the current, public revision, never a draft.
CREATE FUNCTION keibi_check_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM duty_slots s JOIN duty_revisions r ON r.company_id=s.company_id AND r.id=s.published_version_id
    JOIN officers o ON o.company_id=NEW.company_id AND o.id=NEW.officer_id
    WHERE s.company_id=NEW.company_id AND s.id=NEW.slot_id AND s.state='confirmed' AND r.state='published'
      AND r.id=NEW.revision_id AND r.starts_at=NEW.starts_at AND r.ends_at=NEW.ends_at
      AND o.branch_id=s.branch_id AND o.status='active') THEN
    RAISE EXCEPTION 'reservation does not match publication' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER reservation_publication_check AFTER INSERT OR UPDATE ON officer_reservations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION keibi_check_reservation();

-- Public contents and assignment snapshots are immutable. Status changes retain their contents.
CREATE FUNCTION keibi_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> NEW.state AND NOT (
    (OLD.state='draft' AND NEW.state IN ('published','discarded')) OR
    (OLD.state='published' AND NEW.state IN ('superseded','cancelled'))
  ) THEN RAISE EXCEPTION 'invalid publication state transition' USING ERRCODE='23514'; END IF;
  IF OLD.state <> 'draft' AND (to_jsonb(OLD) - 'state') IS DISTINCT FROM (to_jsonb(NEW) - 'state') THEN
    RAISE EXCEPTION 'published revision is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_public_revision BEFORE UPDATE ON duty_revisions FOR EACH ROW EXECUTE FUNCTION keibi_immutable_revision();
CREATE FUNCTION keibi_immutable_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state text; revision_company uuid; revision_identifier uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    SELECT state INTO revision_state FROM duty_revisions WHERE company_id=OLD.company_id AND id=OLD.revision_id;
    IF revision_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'published assignments are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN revision_company:=OLD.company_id; revision_identifier:=OLD.revision_id;
  ELSE revision_company:=NEW.company_id; revision_identifier:=NEW.revision_id; END IF;
  SELECT state INTO revision_state FROM duty_revisions WHERE company_id=revision_company AND id=revision_identifier;
  IF revision_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'published assignments are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_assignment BEFORE INSERT OR UPDATE OR DELETE ON duty_assignments FOR EACH ROW EXECUTE FUNCTION keibi_immutable_assignment();
CREATE TRIGGER immutable_qualification_requirement BEFORE INSERT OR UPDATE OR DELETE ON duty_qualification_requirements FOR EACH ROW EXECUTE FUNCTION keibi_immutable_assignment();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['officers','qualifications','officer_qualifications','clients','client_branch_access','sites',
    'duty_slots','duty_revisions','duty_assignments','duty_qualification_requirements','officer_reservations','audit_events','idempotency_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (company_id = nullif(current_setting(''app.company_id'',true),'''')::uuid) WITH CHECK (company_id = nullif(current_setting(''app.company_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;
