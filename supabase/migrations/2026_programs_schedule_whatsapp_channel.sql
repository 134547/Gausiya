-- ============================================================================
-- Madrasa Gausiya Razvia — Programs Schedule (Start/End Date & Time), Poster,
-- WhatsApp Contact, WhatsApp Channel & Registration Fee Schema Update
-- Run once in Supabase Dashboard -> SQL Editor -> New Query
-- Safe to re-run (idempotent).
-- ============================================================================

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS end_time TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS poster_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_channel_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_channel_link TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT NOT NULL DEFAULT '';

-- Backfill end_date from program_date where missing
UPDATE public.programs
SET end_date = program_date
WHERE end_date IS NULL;

-- Backfill existing PROGRAM_META JSON values stored in public.documents (if any)
UPDATE public.programs p
SET
  poster_url = COALESCE(NULLIF(p.poster_url, ''), NULLIF((d.file_url::jsonb ->> 'poster_url'), ''), ''),
  whatsapp_number = COALESCE(NULLIF(p.whatsapp_number, ''), NULLIF((d.file_url::jsonb ->> 'whatsapp_number'), ''), ''),
  whatsapp_channel_name = COALESCE(NULLIF(p.whatsapp_channel_name, ''), NULLIF((d.file_url::jsonb ->> 'whatsapp_channel_name'), ''), ''),
  whatsapp_channel_link = COALESCE(NULLIF(p.whatsapp_channel_link, ''), NULLIF((d.file_url::jsonb ->> 'whatsapp_channel_link'), ''), ''),
  end_time = COALESCE(NULLIF(p.end_time, ''), NULLIF((d.file_url::jsonb ->> 'end_time'), ''), ''),
  end_date = COALESCE(
    p.end_date,
    NULLIF((d.file_url::jsonb ->> 'end_date'), '')::date,
    p.program_date
  ),
  registration_enabled = COALESCE((d.file_url::jsonb ->> 'registration_enabled')::boolean, p.registration_enabled, TRUE),
  payment_required = COALESCE((d.file_url::jsonb ->> 'payment_required')::boolean, p.payment_required, FALSE),
  payment_amount = COALESCE(NULLIF((d.file_url::jsonb ->> 'payment_amount'), '')::numeric, p.payment_amount, 0),
  payment_instructions = COALESCE(NULLIF(p.payment_instructions, ''), NULLIF((d.file_url::jsonb ->> 'payment_instructions'), ''), '')
FROM (
  SELECT DISTINCT ON (entity_id) entity_id, file_url
  FROM public.documents
  WHERE entity_type = 'general'
    AND title = 'PROGRAM_META'
  ORDER BY entity_id, created_at DESC
) d
WHERE d.entity_id = p.id
  AND d.file_url ~ '^\{.*\}$';
