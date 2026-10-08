CREATE TABLE companies (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE branches (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), code text NOT NULL, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('headquarters','branch')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  officer_limit integer NOT NULL DEFAULT 10 CHECK (officer_limit BETWEEN 10 AND 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE(company_id,id), UNIQUE(company_id,code)
);
CREATE UNIQUE INDEX one_headquarters_per_company ON branches(company_id) WHERE kind='headquarters';
CREATE TABLE app_users (
  id uuid PRIMARY KEY, display_name text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended'))
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES app_users(id),
  company_id uuid NOT NULL REFERENCES companies(id), branch_id uuid NOT NULL, role text NOT NULL,
  officer_id uuid, invitation_email text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
  auth_version integer NOT NULL DEFAULT 1 CHECK (auth_version>0), version integer NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK (role IN ('company_admin','dispatcher','viewer','guard')),
  CHECK ((role='guard' AND officer_id IS NOT NULL) OR (role<>'guard' AND officer_id IS NULL)),
  UNIQUE(company_id,id), FOREIGN KEY(company_id,branch_id) REFERENCES branches(company_id,id)
);
CREATE UNIQUE INDEX one_guard_account_per_officer ON memberships(company_id,officer_id) WHERE officer_id IS NOT NULL;
CREATE UNIQUE INDEX one_invitation_email_per_company ON memberships(company_id,lower(invitation_email));
CREATE TABLE google_identities (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id),
  issuer text NOT NULL CHECK (issuer='https://accounts.google.com'), subject text NOT NULL,
  email text NOT NULL, linked_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE UNIQUE INDEX google_identity_subject ON google_identities(issuer,subject) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX google_identity_user ON google_identities(user_id) WHERE revoked_at IS NULL;
CREATE TABLE auth_invitations (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), membership_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64), issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
  issued_by uuid REFERENCES app_users(id), delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sent','failed')),
  FOREIGN KEY(company_id,membership_id) REFERENCES memberships(company_id,id), CHECK(expires_at=issued_at+interval '168 hours')
);
CREATE TABLE auth_oauth_transactions (
  state_hash text PRIMARY KEY CHECK(length(state_hash)=64), browser_hash text NOT NULL CHECK(length(browser_hash)=64),
  nonce text NOT NULL, verifier text NOT NULL, invitation_hash text, return_to text NOT NULL,
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE app_sessions (
  id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
  user_id uuid NOT NULL REFERENCES app_users(id), membership_id uuid NOT NULL REFERENCES memberships(id), auth_version integer NOT NULL,
  created_at timestamptz NOT NULL, last_activity_at timestamptz NOT NULL, absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz, CHECK(absolute_expires_at>created_at)
);
CREATE INDEX app_sessions_user ON app_sessions(user_id);
CREATE TABLE auth_audit_events (
  id uuid PRIMARY KEY, company_id uuid REFERENCES companies(id), actor_id uuid,
  target_id uuid, action text NOT NULL, reason text, evidence text, created_at timestamptz NOT NULL,
  result text NOT NULL CHECK(result IN ('success','rejected'))
);
CREATE TABLE auth_idempotency_keys (
  company_id uuid NOT NULL REFERENCES companies(id), user_id uuid NOT NULL REFERENCES app_users(id), key uuid NOT NULL,
  fingerprint text NOT NULL, status_code integer NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL,
  entity_type text NOT NULL CHECK(entity_type IN ('branch','membership')), entity_id uuid NOT NULL,
  headquarters_required boolean NOT NULL,
  PRIMARY KEY(company_id,user_id,key)
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY company_tenant ON companies USING(id::text=current_setting('app.company_id',true)) WITH CHECK(id::text=current_setting('app.company_id',true));
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
CREATE POLICY branch_tenant ON branches USING(company_id::text=current_setting('app.company_id',true)) WITH CHECK(company_id::text=current_setting('app.company_id',true));
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant ON memberships USING(company_id::text=current_setting('app.company_id',true)) WITH CHECK(company_id::text=current_setting('app.company_id',true));
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
CREATE POLICY user_tenant ON app_users USING(EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=app_users.id AND m.company_id::text=current_setting('app.company_id',true)))
  WITH CHECK(current_setting('app.role',true)='company_admin');
ALTER TABLE auth_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant ON auth_invitations USING(company_id::text=current_setting('app.company_id',true)) WITH CHECK(company_id::text=current_setting('app.company_id',true));
ALTER TABLE auth_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_audit_tenant ON auth_audit_events FOR SELECT USING(company_id::text=current_setting('app.company_id',true));
CREATE POLICY auth_audit_insert ON auth_audit_events FOR INSERT WITH CHECK(company_id::text=current_setting('app.company_id',true));
ALTER TABLE auth_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_idempotency_tenant ON auth_idempotency_keys USING(company_id::text=current_setting('app.company_id',true)) WITH CHECK(company_id::text=current_setting('app.company_id',true));

CREATE FUNCTION keibi_oauth_start(p_state text,p_browser text,p_nonce text,p_verifier text,p_invitation text,p_return text,p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  INSERT INTO public.auth_oauth_transactions(state_hash,browser_hash,nonce,verifier,invitation_hash,return_to,created_at,expires_at)
    VALUES(p_state,p_browser,p_nonce,p_verifier,p_invitation,p_return,p_now,p_now+interval '10 minutes');
$$;
CREATE FUNCTION keibi_oauth_consume(p_state text,p_browser text,p_now timestamptz)
RETURNS TABLE(nonce text,verifier text,invitation_hash text,return_to text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.auth_oauth_transactions SET consumed_at=p_now WHERE state_hash=p_state AND browser_hash=p_browser
    AND consumed_at IS NULL AND expires_at>p_now
    RETURNING nonce,verifier,invitation_hash,return_to;
$$;
CREATE FUNCTION keibi_invitation_inspect(p_hash text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('displayName',u.display_name,'invitationEmail',m.invitation_email,'companyName',c.name,'branchName',b.name,'role',m.role,'expiresAt',i.expires_at)
 FROM public.auth_invitations i JOIN public.memberships m ON m.id=i.membership_id JOIN public.app_users u ON u.id=m.user_id
 JOIN public.companies c ON c.id=m.company_id JOIN public.branches b ON b.id=m.branch_id
 WHERE i.token_hash=p_hash AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>p_now
 AND m.status='invited' AND c.status='active' AND b.status='active';
$$;
CREATE FUNCTION keibi_login(p_subject text,p_email text,p_invitation text,p_mfa boolean,p_session_id uuid,p_session_hash text,p_identity_id uuid,p_audit_id uuid,p_now timestamptz,p_absolute timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m public.memberships%ROWTYPE; i public.auth_invitations%ROWTYPE; linked_user uuid; tenant uuid;
BEGIN
 SELECT user_id INTO linked_user FROM public.google_identities WHERE issuer='https://accounts.google.com' AND subject=p_subject AND revoked_at IS NULL;
 IF p_invitation IS NOT NULL THEN
   SELECT company_id INTO tenant FROM public.auth_invitations WHERE token_hash=p_invitation;
   IF tenant IS NULL THEN RETURN jsonb_build_object('error','INVITATION_INVALID'); END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text,42));
   SELECT user_id INTO linked_user FROM public.google_identities WHERE issuer='https://accounts.google.com' AND subject=p_subject AND revoked_at IS NULL;
   SELECT * INTO i FROM public.auth_invitations WHERE token_hash=p_invitation FOR UPDATE;
   IF NOT FOUND OR i.consumed_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at<=p_now THEN RETURN jsonb_build_object('error','INVITATION_INVALID'); END IF;
   SELECT * INTO m FROM public.memberships WHERE id=i.membership_id FOR UPDATE;
   IF m.status<>'invited' OR lower(m.invitation_email)<>lower(p_email) OR linked_user IS NOT NULL
     OR EXISTS(SELECT 1 FROM public.google_identities WHERE user_id=m.user_id AND revoked_at IS NULL)
     THEN RETURN jsonb_build_object('error','AUTH_NOT_ALLOWED'); END IF;
 ELSE
   IF linked_user IS NULL THEN RETURN jsonb_build_object('error','AUTH_NOT_ALLOWED'); END IF;
   SELECT company_id INTO tenant FROM public.memberships WHERE user_id=linked_user;
   PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text,42));
   SELECT user_id INTO linked_user FROM public.google_identities WHERE issuer='https://accounts.google.com' AND subject=p_subject AND revoked_at IS NULL;
   IF linked_user IS NULL THEN RETURN jsonb_build_object('error','AUTH_NOT_ALLOWED'); END IF;
   SELECT * INTO m FROM public.memberships WHERE user_id=linked_user FOR UPDATE;
   IF NOT FOUND OR m.status<>'active' THEN RETURN jsonb_build_object('error','AUTH_NOT_ALLOWED'); END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies c JOIN public.branches b ON b.company_id=c.id WHERE c.id=m.company_id AND b.id=m.branch_id AND c.status='active' AND b.status='active')
   OR EXISTS(SELECT 1 FROM public.app_users WHERE id=m.user_id AND status='suspended') THEN RETURN jsonb_build_object('error','AUTH_NOT_ALLOWED'); END IF;
 IF m.role='company_admin' AND NOT p_mfa THEN RETURN jsonb_build_object('error','AUTH_POLICY_REQUIRED'); END IF;
 IF p_invitation IS NOT NULL THEN
   INSERT INTO public.google_identities VALUES(p_identity_id,m.user_id,'https://accounts.google.com',p_subject,p_email,p_now,NULL);
   UPDATE public.auth_invitations SET consumed_at=p_now WHERE id=i.id;
   UPDATE public.memberships SET status='active',version=version+1 WHERE id=m.id;
   UPDATE public.app_users SET status='active' WHERE id=m.user_id;
 ELSE
   UPDATE public.google_identities SET email=p_email WHERE user_id=m.user_id AND revoked_at IS NULL;
 END IF;
 INSERT INTO public.app_sessions VALUES(p_session_id,p_session_hash,m.user_id,m.id,m.auth_version,p_now,p_now,p_absolute,NULL);
 INSERT INTO public.auth_audit_events VALUES(p_audit_id,m.company_id,m.user_id,m.user_id,'login',NULL,NULL,p_now,'success');
 RETURN jsonb_build_object('role',m.role,'userId',m.user_id);
END;
$$;
CREATE FUNCTION keibi_session(p_hash text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('userId',u.id,'membershipId',m.id,'companyId',m.company_id,'branchId',m.branch_id,'role',m.role,'officerId',m.officer_id,
   'displayName',u.display_name,'email',g.email,'companyName',c.name,'branchName',b.name)
 FROM public.app_sessions s JOIN public.memberships m ON m.id=s.membership_id AND m.user_id=s.user_id
 JOIN public.app_users u ON u.id=m.user_id JOIN public.companies c ON c.id=m.company_id
 JOIN public.branches b ON b.id=m.branch_id AND b.company_id=m.company_id JOIN public.google_identities g ON g.user_id=m.user_id AND g.revoked_at IS NULL
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.auth_version=m.auth_version
 AND s.absolute_expires_at>p_now AND s.last_activity_at+interval '24 hours'>p_now
 AND u.status='active' AND m.status='active' AND c.status='active' AND b.status='active';
$$;
CREATE FUNCTION keibi_session_activity(p_hash text,p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.app_sessions SET last_activity_at=p_now WHERE token_hash=p_hash
   AND public.keibi_session(p_hash,p_now) IS NOT NULL;
$$;
CREATE FUNCTION keibi_session_logout(p_hash text,p_all boolean,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; tenant uuid;
BEGIN
 SELECT s.user_id,m.company_id INTO actor,tenant FROM public.app_sessions s JOIN public.memberships m ON m.id=s.membership_id WHERE s.token_hash=p_hash;
 UPDATE public.app_sessions SET revoked_at=p_now WHERE revoked_at IS NULL AND
 (token_hash=p_hash OR (p_all AND user_id=(SELECT user_id FROM public.app_sessions WHERE token_hash=p_hash)));
 IF actor IS NOT NULL THEN
   INSERT INTO public.auth_audit_events(id,company_id,actor_id,target_id,action,created_at,result)
   VALUES(gen_random_uuid(),tenant,actor,actor,CASE WHEN p_all THEN 'session.logout_all' ELSE 'session.logout' END,p_now,'success');
 END IF;
END;
$$;
CREATE FUNCTION keibi_revoke_user_sessions(p_user uuid,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=p_user AND company_id::text=current_setting('app.company_id',true)) THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
 UPDATE public.app_sessions SET revoked_at=p_now WHERE user_id=p_user AND revoked_at IS NULL;
END;
$$;
CREATE FUNCTION keibi_google_email(p_user uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT g.email FROM public.google_identities g JOIN public.memberships m ON m.user_id=g.user_id
 WHERE g.user_id=p_user AND g.revoked_at IS NULL AND m.company_id::text=current_setting('app.company_id',true);
$$;
CREATE FUNCTION keibi_revoke_google(p_user uuid,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('app.role',true)<>'company_admin' OR NOT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=p_user AND company_id::text=current_setting('app.company_id',true)) THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
 UPDATE public.google_identities SET revoked_at=p_now WHERE user_id=p_user AND revoked_at IS NULL;
 PERFORM public.keibi_revoke_user_sessions(p_user,p_now);
END;
$$;
CREATE FUNCTION keibi_auth_rejection(p_state text,p_code text,p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 INSERT INTO public.auth_audit_events(id,company_id,target_id,action,reason,created_at,result)
 SELECT gen_random_uuid(),m.company_id,m.user_id,'login.rejected',
   CASE WHEN p_code IN ('AUTH_TRANSACTION_INVALID','AUTH_CANCELLED','AUTH_NOT_ALLOWED','AUTH_POLICY_REQUIRED','AUTH_UNAVAILABLE') THEN p_code ELSE 'AUTH_NOT_ALLOWED' END,
   p_now,'rejected'
 FROM (SELECT 1) singleton LEFT JOIN public.auth_oauth_transactions t ON t.state_hash=p_state
 LEFT JOIN public.auth_invitations i ON i.token_hash=t.invitation_hash LEFT JOIN public.memberships m ON m.id=i.membership_id;
$$;
REVOKE ALL ON google_identities,auth_oauth_transactions,app_sessions FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
