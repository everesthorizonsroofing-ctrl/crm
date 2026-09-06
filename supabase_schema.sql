-- ============================================================================
-- EVEREST CRM — SUPABASE DATABASE SETUP
-- ============================================================================

-- 1. Ensure tables exist
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  source TEXT DEFAULT 'Website',
  status TEXT DEFAULT 'New',
  date_added TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  status TEXT DEFAULT 'Waiting - Other',
  est_value TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  last_contact TEXT DEFAULT '',
  added_by TEXT DEFAULT '',
  promoted_from TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  address TEXT DEFAULT '',
  material TEXT DEFAULT '',
  status TEXT DEFAULT 'Just Started',
  start_date TEXT DEFAULT '',
  est_completion TEXT DEFAULT '',
  crew TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  final_value TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS past_builds (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  address TEXT DEFAULT '',
  material TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  final_value TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'Pending',
  assignee TEXT DEFAULT 'Unassigned',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Drop old policies if they exist, then recreate
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all leads" ON leads;
DROP POLICY IF EXISTS "Allow public all clients" ON clients;
DROP POLICY IF EXISTS "Allow public all builds" ON builds;
DROP POLICY IF EXISTS "Allow public all past_builds" ON past_builds;
DROP POLICY IF EXISTS "Allow public all tickets" ON tickets;

CREATE POLICY "Allow public all leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all clients" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all builds" ON builds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all past_builds" ON past_builds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all tickets" ON tickets FOR ALL USING (true) WITH CHECK (true);

-- 3. Safely enable Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE leads;
  EXCEPTION WHEN duplicate_object THEN END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  EXCEPTION WHEN duplicate_object THEN END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE builds;
  EXCEPTION WHEN duplicate_object THEN END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE past_builds;
  EXCEPTION WHEN duplicate_object THEN END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
  EXCEPTION WHEN duplicate_object THEN END;
END $$;

-- 4. Pre-populate your 7 leads
INSERT INTO leads (id, name, phone, email, address, source, status, date_added, notes, archived) VALUES
('lead_1', 'Reynier Torres', '786-803-1254', '', '', 'Instagram', 'New', '2026-09-06T12:00:00.000Z', 'We need send design to the client and follow up', false),
('lead_2', 'Matthew Stellfox', '', '', '', 'Messenger', 'New', '2026-09-06T12:00:00.000Z', 'Interested in $52k pool - follow up', false),
('lead_3', 'Joseph Brent Satterfield', '', '', '', 'Messenger', 'New', '2026-09-06T12:00:00.000Z', 'Waiting for their reply', false),
('lead_4', 'Kristy Morris Page', '', '', '', 'Messenger', 'New', '2026-09-06T12:00:00.000Z', 'Client wants design - Possible Feb build', false),
('lead_5', 'Keren Stallin', '469-888-3065', '', '', 'Messenger', 'New', '2026-09-06T12:00:00.000Z', 'Consultation done - follow up', false),
('lead_6', 'Kay West Parrish', '817-343-0311', '', '', 'Messenger', 'New', '2026-09-06T12:00:00.000Z', 'Consultation done, survey received', false),
('lead_7', 'Gabriel Sellan', '', '', '', 'Instagram', 'New', '2026-09-06T12:00:00.000Z', 'Asked for survey - waiting Follow up', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Pre-populate default tasks
INSERT INTO tickets (id, description, status, assignee) VALUES
('task_1', 'Roofing Website', 'In Progress', 'KN'),
('task_2', 'Pool Website', 'Pending', 'KN'),
('task_3', 'Pool Social Media', 'Pending', 'KN'),
('task_4', 'Build a CRM', 'In Progress', 'KN'),
('task_5', 'Automated Text to AK for Critical To-Dos', 'Pending', 'Unassigned'),
('task_6', 'Roofing Metal & Spanish Style Clay Pricing', 'Pending', 'AK'),
('task_7', 'Google Review Boost', 'Pending', 'Unassigned'),
('task_8', 'Business Phone Number Setup', 'Pending', 'Unassigned')
ON CONFLICT (id) DO NOTHING;
