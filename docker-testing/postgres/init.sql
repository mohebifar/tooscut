CREATE TABLE IF NOT EXISTS projects (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  name        TEXT        NOT NULL DEFAULT 'Untitled Project',
  settings    JSONB       NOT NULL DEFAULT '{}',
  content     JSONB       NOT NULL DEFAULT '{}',
  thumbnail   TEXT,
  archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_active
  ON projects (user_id, updated_at DESC)
  WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_user_archived
  ON projects (user_id, updated_at DESC)
  WHERE archived = TRUE;

INSERT INTO projects (id, user_id, name, settings, content) VALUES (
  'test-project-001',
  'test-user-sub-00000001',
  'Sample Project',
  '{"resolution":{"width":1920,"height":1080},"frameRate":25}',
  '{}'
) ON CONFLICT (id) DO NOTHING;
