-- Non-destructive migration to allow the 'public' portal role and linked_type
-- Preserves all existing tables and rows cleanly.

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_linked_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_linked_type_check
  CHECK (linked_type IN ('student', 'teacher', 'parent', 'committee', 'admin', 'public'));

INSERT INTO public.roles (name, slug, description)
VALUES ('Public', 'public', 'Public account access to feed, notices, programs, committee, and contact information')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;
