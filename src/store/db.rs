use rusqlite::{params, Connection, Result};

pub struct DB {
    conn: Connection,
}

impl DB {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
        ")?;
        Self::migrate(&conn)?;
        Ok(DB { conn })
    }

    fn migrate(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
    }

    pub fn cleanup_unpinned_images(&self) -> Result<()> {
        self.conn.execute(
            "DELETE FROM clips WHERE pinned = 0 AND content LIKE '[FILE]:%'",
            [],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Cleanly shut down WAL mode before process exit.
    /// Switching journal_mode back to DELETE causes SQLite to checkpoint all
    /// pending WAL frames and then physically delete both the .wal and .shm
    /// files. This is necessary because process::exit() skips Drop, so the
    /// normal connection-close cleanup never runs.
    pub fn checkpoint(&self) {
        let _ = self.conn.execute_batch("
            PRAGMA wal_checkpoint(TRUNCATE);
            PRAGMA journal_mode = DELETE;
        ");
    }
}