"""
The SQLite database (backend/vao2.db): categories, sources and articles.

Every read and write of the database goes through the functions here; routes
call them, nothing else opens the file.

    categories   groups the user puts sources in ("General" always exists)
    sources      a YouTube channel or a news feed the user added
    articles     the entries of those feeds, plus what the AI panel stored
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import sqlite3
from pathlib import Path
from uuid import uuid4


DB_PATH = Path(__file__).with_name("vao2.db")
GENERAL_CATEGORY_ID = "general"

SCHEMA = """
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
    embeddable INTEGER,
    published_at TEXT,
    UNIQUE (source_id, guid),
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
"""

# Columns added to `articles` after the first release. A database created by
# an older version gets them on startup.
ADDED_ARTICLE_COLUMNS = {
    "content": "TEXT NOT NULL DEFAULT ''",
    "content_source": "TEXT NOT NULL DEFAULT ''",
    "ai_summary": "TEXT NOT NULL DEFAULT ''",
    "ai_summary_model": "TEXT NOT NULL DEFAULT ''",
    "ai_summary_updated_at": "TEXT",
    # NULL until checked; 1 plays in the embedded player, 0 only on YouTube.
    "embeddable": "INTEGER",
}

# Platforms an older version supported and this one no longer reads.
REMOVED_PLATFORMS = ("github", "podcast", "rss")

ARTICLE_WITH_SOURCE = """
    SELECT articles.*,
           sources.title AS source_title,
           sources.platform,
           sources.category_id
    FROM articles
    JOIN sources ON sources.id = articles.source_id
"""


#/////////////////////////////////////////////////////////
# CONNECTION AND SETUP ///////////////////////////////////
#/////////////////////////////////////////////////////////
def _connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _rows(query, values=()):
    with _connect() as connection:
        rows = connection.execute(query, values).fetchall()

    return [dict(row) for row in rows]


def init_db():
    """Create the tables, and bring a database from an older version up to date."""
    with _connect() as connection:
        connection.executescript(SCHEMA)

        connection.execute(
            "INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)",
            (GENERAL_CATEGORY_ID, "General"),
        )

        placeholders = ", ".join("?" for _ in REMOVED_PLATFORMS)
        connection.execute(
            f"DELETE FROM sources WHERE platform IN ({placeholders})",
            REMOVED_PLATFORMS,
        )

        existing_columns = set()
        for row in connection.execute("PRAGMA table_info(articles)").fetchall():
            existing_columns.add(row["name"])

        for column, definition in ADDED_ARTICLE_COLUMNS.items():
            if column not in existing_columns:
                connection.execute(f"ALTER TABLE articles ADD COLUMN {column} {definition}")


#/////////////////////////////////////////////////////////
# CATEGORIES /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def list_categories():
    # "General" first, then alphabetical.
    return _rows("SELECT id, name FROM categories ORDER BY id != 'general', name")


def create_category(name, category_id=None):
    """Create a category, or return the existing one with that name."""
    category_id = category_id or f"cat_{uuid4().hex}"
    name = name.strip()

    with _connect() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)",
            (category_id, name),
        )
        row = connection.execute(
            "SELECT id, name FROM categories WHERE id = ? OR name = ?",
            (category_id, name),
        ).fetchone()

    return dict(row)


def delete_category(category_id):
    """Delete a category; its sources move to "General", which cannot be deleted."""
    if category_id == GENERAL_CATEGORY_ID:
        return False

    with _connect() as connection:
        connection.execute(
            "UPDATE sources SET category_id = ? WHERE category_id = ?",
            (GENERAL_CATEGORY_ID, category_id),
        )
        cursor = connection.execute(
            "DELETE FROM categories WHERE id = ?",
            (category_id,),
        )

    return cursor.rowcount > 0


def _category_exists(connection, category_id):
    row = connection.execute(
        "SELECT 1 FROM categories WHERE id = ?",
        (category_id,),
    ).fetchone()

    return row is not None


#/////////////////////////////////////////////////////////
# SOURCES ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def list_sources():
    return _rows(
        """
        SELECT id, platform, category_id, url, feed_url, title, subtitle,
               thumbnail, added_at, last_fetched_at, fetch_error
        FROM sources
        ORDER BY added_at DESC
        """
    )


def add_source(source):
    """Add a source, or return the existing one with the same URL."""
    source_id = source.get("id") or f"src_{uuid4().hex}"

    with _connect() as connection:
        category_id = source.get("category_id") or GENERAL_CATEGORY_ID
        if not _category_exists(connection, category_id):
            category_id = GENERAL_CATEGORY_ID

        connection.execute(
            """
            INSERT OR IGNORE INTO sources
                (id, platform, category_id, url, feed_url, title, subtitle, thumbnail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
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
        row = connection.execute(
            "SELECT * FROM sources WHERE url = ?",
            (source["url"],),
        ).fetchone()

    return dict(row)


def update_source_category(source_id, category_id):
    with _connect() as connection:
        if not _category_exists(connection, category_id):
            return None

        connection.execute(
            "UPDATE sources SET category_id = ? WHERE id = ?",
            (category_id, source_id),
        )
        row = connection.execute(
            "SELECT * FROM sources WHERE id = ?",
            (source_id,),
        ).fetchone()

    return dict(row) if row else None


def delete_source(source_id):
    """Delete a source and, through the foreign key, all its articles."""
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM sources WHERE id = ?",
            (source_id,),
        )

    return cursor.rowcount > 0


def mark_source_fetched(source_id, error=None):
    with _connect() as connection:
        connection.execute(
            """
            UPDATE sources
            SET last_fetched_at = CURRENT_TIMESTAMP, fetch_error = ?
            WHERE id = ?
            """,
            (error, source_id),
        )


#/////////////////////////////////////////////////////////
# ARTICLES ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def save_articles(source_id, articles):
    """
    Store a source's feed entries; return how many were new.

    An entry already stored (same source and guid) is updated rather than
    duplicated, because feeds edit titles and summaries after publishing.
    """
    added = 0

    with _connect() as connection:
        for article in articles:
            fields = (
                article["url"],
                article["title"],
                article.get("summary", ""),
                article.get("image_url", ""),
                article.get("author", ""),
                article.get("media_type", ""),
                article.get("media_url", ""),
                article.get("published_at"),
            )

            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO articles
                    (url, title, summary, image_url, author,
                     media_type, media_url, published_at, source_id, guid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (*fields, source_id, article["guid"]),
            )

            if cursor.rowcount:
                added += 1
                continue

            connection.execute(
                """
                UPDATE articles
                SET url = ?, title = ?, summary = ?, image_url = ?, author = ?,
                    media_type = ?, media_url = ?, published_at = ?
                WHERE source_id = ? AND guid = ?
                """,
                (*fields, source_id, article["guid"]),
            )

    return added


def list_articles(limit=100):
    """Newest first; articles without a date go last."""
    return _rows(
        ARTICLE_WITH_SOURCE
        + """
        ORDER BY published_at IS NULL, published_at DESC, articles.id DESC
        LIMIT ?
        """,
        (limit,),
    )


def get_article(article_id):
    rows = _rows(
        ARTICLE_WITH_SOURCE + " WHERE articles.id = ?",
        (article_id,),
    )

    return rows[0] if rows else None


#/////////////////////////////////////////////////////////
# AI PANEL DATA //////////////////////////////////////////
#/////////////////////////////////////////////////////////
def save_article_content(article_id, content, content_source):
    """Store the full text; any summary made from the old text is dropped."""
    with _connect() as connection:
        connection.execute(
            """
            UPDATE articles
            SET content = ?, content_source = ?,
                ai_summary = '', ai_summary_model = '', ai_summary_updated_at = NULL
            WHERE id = ?
            """,
            (content, content_source, article_id),
        )


def save_article_ai_summary(article_id, summary, model_key):
    with _connect() as connection:
        connection.execute(
            """
            UPDATE articles
            SET ai_summary = ?, ai_summary_model = ?,
                ai_summary_updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (summary, model_key, article_id),
        )


#/////////////////////////////////////////////////////////
# YOUTUBE EMBEDDING STATUS ///////////////////////////////
#/////////////////////////////////////////////////////////
def set_article_embeddable(article_id, embeddable):
    with _connect() as connection:
        cursor = connection.execute(
            "UPDATE articles SET embeddable = ? WHERE id = ? AND media_type = 'youtube'",
            (int(embeddable), article_id),
        )

    return cursor.rowcount > 0


def unchecked_youtube_articles(limit=200):
    return _rows(
        """
        SELECT id, media_url
        FROM articles
        WHERE media_type = 'youtube' AND embeddable IS NULL
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    )


def save_embeddable_statuses(status_by_article):
    """`status_by_article` maps an article id to True or False."""
    rows = []
    for article_id, embeddable in status_by_article.items():
        rows.append((int(embeddable), article_id))

    with _connect() as connection:
        connection.executemany(
            "UPDATE articles SET embeddable = ? WHERE id = ?",
            rows,
        )
