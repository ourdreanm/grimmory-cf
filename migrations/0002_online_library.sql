PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('novel','comic','book','mixed')),
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('novel','comic','book')),
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  description TEXT,
  cover_url TEXT,
  language TEXT,
  status TEXT,
  year INTEGER,
  categories_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  source_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT,
  metadata_json TEXT,
  content_available INTEGER NOT NULL DEFAULT 0,
  reader_available INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, external_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  source_id INTEGER,
  external_id TEXT,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, source_id, external_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chapter_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, page_index),
  FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_library (
  user_id INTEGER NOT NULL,
  work_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'want' CHECK(status IN ('want','reading','completed')),
  favorite INTEGER NOT NULL DEFAULT 0,
  last_chapter_id INTEGER,
  progress REAL NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, work_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(last_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_chapter_progress (
  user_id INTEGER NOT NULL,
  chapter_id INTEGER NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, chapter_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_works_type_updated ON works(type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sources_work ON work_sources(work_id);
CREATE INDEX IF NOT EXISTS idx_chapters_work_index ON chapters(work_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_library_user_updated ON user_library(user_id, updated_at DESC);

INSERT OR IGNORE INTO sources(name,type,base_url,priority) VALUES
  ('Open Library','book','https://openlibrary.org',100),
  ('Google Books','book','https://books.google.com',110);
