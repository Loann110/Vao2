import sqlite3
from pathlib import Path
from uuid import uuid4


DB_PATH = Path(__file__).with_name("vao2.db")
GENERAL_CATEGORY_ID = "general"


def _connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                category_id TEXT NOT NULL DEFAULT 'general',
                url TEXT NOT NULL UNIQUE,
                feed_url TEXT,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                thumbnail TEXT NOT NULL DEFAULT '',
                added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_fetched_at TEXT,
                fetch_error TEXT,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                guid TEXT NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                image_url TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                media_type TEXT NOT NULL DEFAULT '',
                media_url TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                content_source TEXT NOT NULL DEFAULT '',
                ai_summary TEXT NOT NULL DEFAULT '',
                ai_summary_model TEXT NOT NULL DEFAULT '',
                ai_summary_updated_at TEXT,
                published_at TEXT,
                UNIQUE (source_id, guid),
                FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
            );
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)",
            (GENERAL_CATEGORY_ID, "General"),
        )
        article_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(articles)").fetchall()
        }
        if "content" not in article_columns:
            connection.execute("ALTER TABLE articles ADD COLUMN content TEXT NOT NULL DEFAULT ''")
        if "content_source" not in article_columns:
            connection.execute(
                "ALTER TABLE articles ADD COLUMN content_source TEXT NOT NULL DEFAULT ''"
            )
        if "ai_summary" not in article_columns:
            connection.execute(
                "ALTER TABLE articles ADD COLUMN ai_summary TEXT NOT NULL DEFAULT ''"
            )
        if "ai_summary_model" not in article_columns:
            connection.execute(
                "ALTER TABLE articles ADD COLUMN ai_summary_model TEXT NOT NULL DEFAULT ''"
            )
        if "ai_summary_updated_at" not in article_columns:
            connection.execute(
                "ALTER TABLE articles ADD COLUMN ai_summary_updated_at TEXT"
            )


def _rows(query, values=()):
    with _connect() as connection:
        return [dict(row) for row in connection.execute(query, values).fetchall()]


def list_categories():
    return _rows("SELECT id, name FROM categories ORDER BY id != 'general', name")


def create_category(name, category_id=None):
    category_id = category_id or f"cat_{uuid4().hex}"
    with _connect() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)",
            (category_id, name.strip()),
        )
        row = connection.execute(
            "SELECT id, name FROM categories WHERE id = ? OR name = ?",
            (category_id, name.strip()),
        ).fetchone()
    return dict(row)


def delete_category(category_id):
    if category_id == GENERAL_CATEGORY_ID:
        return False
    with _connect() as connection:
        connection.execute(
            "UPDATE sources SET category_id = ? WHERE category_id = ?",
            (GENERAL_CATEGORY_ID, category_id),
        )
        cursor = connection.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        return cursor.rowcount > 0


def list_sources():
    return _rows(
        """SELECT id, platform, category_id, url, feed_url, title, subtitle,
                  thumbnail, added_at, last_fetched_at, fetch_error
           FROM sources ORDER BY added_at DESC"""
    )


def add_source(source):
    source_id = source.get("id") or f"src_{uuid4().hex}"
    with _connect() as connection:
        category_id = source.get("category_id") or GENERAL_CATEGORY_ID
        exists = connection.execute(
            "SELECT 1 FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if not exists:
            category_id = GENERAL_CATEGORY_ID

        connection.execute(
            """INSERT OR IGNORE INTO sources
               (id, platform, category_id, url, feed_url, title, subtitle, thumbnail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                source_id,
                source["platform"],
                category_id,
                source["url"],
                source.get("feed_url"),
                source.get("title") or source["url"],
                source.get("subtitle") or "",
                source.get("thumbnail") or "",
            ),
        )
        row = connection.execute("SELECT * FROM sources WHERE url = ?", (source["url"],)).fetchone()
    return dict(row)


def update_source_category(source_id, category_id):
    with _connect() as connection:
        exists = connection.execute(
            "SELECT 1 FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if not exists:
            return None
        connection.execute(
            "UPDATE sources SET category_id = ? WHERE id = ?", (category_id, source_id)
        )
        row = connection.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
    return dict(row) if row else None


def delete_source(source_id):
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        return cursor.rowcount > 0


def save_articles(source_id, articles):
    added = 0
    with _connect() as connection:
        for article in articles:
            cursor = connection.execute(
                """INSERT OR IGNORE INTO articles
                   (source_id, guid, url, title, summary, image_url, author,
                    media_type, media_url, published_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    source_id,
                    article["guid"],
                    article["url"],
                    article["title"],
                    article.get("summary", ""),
                    article.get("image_url", ""),
                    article.get("author", ""),
                    article.get("media_type", ""),
                    article.get("media_url", ""),
                    article.get("published_at"),
                ),
            )
            if cursor.rowcount:
                added += 1
            else:
                connection.execute(
                    """UPDATE articles
                       SET url = ?, title = ?, summary = ?, image_url = ?, author = ?,
                           media_type = ?, media_url = ?, published_at = ?
                       WHERE source_id = ? AND guid = ?""",
                    (
                        article["url"],
                        article["title"],
                        article.get("summary", ""),
                        article.get("image_url", ""),
                        article.get("author", ""),
                        article.get("media_type", ""),
                        article.get("media_url", ""),
                        article.get("published_at"),
                        source_id,
                        article["guid"],
                    ),
                )
    return added


def mark_source_fetched(source_id, error=None):
    with _connect() as connection:
        connection.execute(
            """UPDATE sources
               SET last_fetched_at = CURRENT_TIMESTAMP, fetch_error = ?
               WHERE id = ?""",
            (error, source_id),
        )


def list_articles(limit=100):
    return _rows(
        """SELECT articles.*, sources.title AS source_title,
                  sources.platform, sources.category_id
           FROM articles JOIN sources ON sources.id = articles.source_id
           ORDER BY published_at IS NULL, published_at DESC, articles.id DESC LIMIT ?""",
        (limit,),
    )


def get_article(article_id):
    rows = _rows(
        """SELECT articles.*, sources.title AS source_title,
                  sources.platform, sources.category_id
           FROM articles JOIN sources ON sources.id = articles.source_id
           WHERE articles.id = ?""",
        (article_id,),
    )
    return rows[0] if rows else None


def save_article_content(article_id, content, content_source):
    with _connect() as connection:
        connection.execute(
            """UPDATE articles
               SET content = ?, content_source = ?, ai_summary = '',
                   ai_summary_model = '', ai_summary_updated_at = NULL
               WHERE id = ?""",
            (content, content_source, article_id),
        )


def save_article_ai_summary(article_id, summary, model_key):
    with _connect() as connection:
        connection.execute(
            """UPDATE articles
               SET ai_summary = ?, ai_summary_model = ?,
                   ai_summary_updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (summary, model_key, article_id),
        )
