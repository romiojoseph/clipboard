use super::db::DB;
use chrono::{DateTime, Utc};
use rusqlite::{params, Result};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: i64,
    pub content: String,
    pub pinned: bool,
    pub tags: String,
    pub created_at: DateTime<Utc>,
}

impl DB {
    pub fn save_clip(&self, content: &str) -> Result<()> {
        if content.trim().is_empty() {
            return Ok(());
        }
        let tags = crate::sensitive::detect_tags(content);
        self.conn().execute(
            "INSERT INTO clips (content, pinned, tags) VALUES (?1, 0, ?2)",
            params![content, tags],
        )?;
        Ok(())
    }

    pub fn update_clip_content(&self, id: i64, content: &str) -> Result<()> {
        let tags = crate::sensitive::detect_tags(content);
        self.conn().execute(
            "UPDATE clips SET content = ?1, tags = ?2 WHERE id = ?3",
            params![content, tags, id],
        )?;
        Ok(())
    }

    pub fn get_clips(&self, query: &str) -> Result<Vec<Clip>> {
        // Use parameterized queries for all branches to prevent SQL injection.
        let trimmed = query.trim();
        let like_pattern = if trimmed.is_empty() {
            None
        } else {
            Some(format!("%{}%", trimmed))
        };
        let sql = if like_pattern.is_some() {
            "SELECT id, content, pinned, tags, created_at FROM clips WHERE content LIKE ?1 ESCAPE '\\' ORDER BY pinned DESC, created_at DESC"
        } else {
            "SELECT id, content, pinned, tags, created_at FROM clips ORDER BY pinned DESC, created_at DESC"
        };
        let mut stmt = self.conn().prepare(sql)?;
        let map_row = |row: &rusqlite::Row<'_>| {
            Ok(Clip {
                id: row.get(0)?,
                content: row.get(1)?,
                pinned: row.get::<_, i32>(2)? == 1,
                tags: row.get(3)?,
                created_at: row.get(4)?,
            })
        };
        let rows: Vec<Clip> = if let Some(ref pattern) = like_pattern {
            stmt.query_map(params![pattern], map_row)?
                .collect::<Result<Vec<_>>>()?  
        } else {
            stmt.query_map([], map_row)?
                .collect::<Result<Vec<_>>>()?  
        };
        let clips = rows
            .into_iter()
            .filter(|clip| {
                if clip.content.starts_with("[FILE]:") {
                    let file_path = clip.content.trim_start_matches("[FILE]:");
                    Path::new(file_path).exists()
                } else {
                    true
                }
            })
            .collect();
        Ok(clips)
    }

    pub fn delete_clip(&self, id: i64) -> Result<()> {
        // Fetch the content first so we can clean up any associated file.
        let content: Option<String> = {
            let mut stmt = self.conn().prepare("SELECT content FROM clips WHERE id = ?1")?;
            let mut rows = stmt.query_map(params![id], |row| row.get(0))?;
            match rows.next() {
                Some(r) => Some(r?),
                None => None,
            }
        };
        let affected = self.conn().execute("DELETE FROM clips WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        // Delete the on-disk file for image clips (best-effort, ignore errors).
        if let Some(c) = content {
            if let Some(file_path) = c.strip_prefix("[FILE]:") {
                let _ = std::fs::remove_file(file_path);
            }
        }
        Ok(())
    }

    pub fn toggle_pin(&self, id: i64, pinned: bool) -> Result<()> {
        let v = if pinned { 1 } else { 0 };
        self.conn()
            .execute("UPDATE clips SET pinned = ?1 WHERE id = ?2", params![v, id])?;
        Ok(())
    }

    pub fn clear_unpinned_clips(&self) -> Result<()> {
        self.conn().execute("DELETE FROM clips WHERE pinned = 0", [])?;
        Ok(())
    }

    pub fn update_clip_tags(&self, id: i64, tags: &str) -> Result<()> {
        self.conn()
            .execute("UPDATE clips SET tags = ?1 WHERE id = ?2", params![tags, id])?;
        Ok(())
    }

    pub fn clip_exists(&self, content: &str) -> Result<bool> {
        let mut stmt = self
            .conn()
            .prepare("SELECT EXISTS(SELECT 1 FROM clips WHERE content = ?1)")?;
        stmt.query_row(params![content], |row| row.get(0))
    }
}