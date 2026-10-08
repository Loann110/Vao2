"""
News sources offered in the "Add source" search.

Called by `backend/routes/sources.py`. A search returns the known outlets whose
name or address matches, plus a live Google News feed for the search itself,
so any topic can become a source.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from urllib.parse import quote_plus


# (name, RSS feed, website)
NEWS_OUTLETS = (
    ("Le Monde", "https://www.lemonde.fr/rss/une.xml", "https://www.lemonde.fr"),
    ("Le Figaro", "https://www.lefigaro.fr/rss/figaro_actualites.xml", "https://www.lefigaro.fr"),
    ("Liberation", "https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml", "https://www.liberation.fr"),
    ("France Info", "https://www.francetvinfo.fr/titres.rss", "https://www.francetvinfo.fr"),
    ("France 24", "https://www.france24.com/fr/rss", "https://www.france24.com"),
    ("Les Echos", "https://services.lesechos.fr/rss/les-echos-economie.xml", "https://www.lesechos.fr"),
    ("Mediapart", "https://www.mediapart.fr/articles/feed", "https://www.mediapart.fr"),
    ("L'Equipe", "https://dwh.lequipe.fr/api/edito/rss?path=/", "https://www.lequipe.fr"),
    ("Next INpact", "https://next.ink/feed/", "https://next.ink"),
    ("Numerama", "https://www.numerama.com/feed/", "https://www.numerama.com"),
    ("Korben", "https://korben.info/feed", "https://korben.info"),
    ("Journal du Net", "https://www.journaldunet.com/rss/", "https://www.journaldunet.com"),
    ("Reuters", "https://www.reutersagency.com/feed/", "https://www.reuters.com"),
    ("BBC News", "https://feeds.bbci.co.uk/news/rss.xml", "https://www.bbc.com/news"),
    ("The Guardian", "https://www.theguardian.com/world/rss", "https://www.theguardian.com"),
    ("Associated Press", "https://rsshub.app/apnews/topics/apf-topnews", "https://apnews.com"),
    ("Hacker News", "https://hnrss.org/frontpage", "https://news.ycombinator.com"),
    ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "https://arstechnica.com"),
    ("The Verge", "https://www.theverge.com/rss/index.xml", "https://www.theverge.com"),
    ("TechCrunch", "https://techcrunch.com/feed/", "https://techcrunch.com"),
    ("MIT Technology Review", "https://www.technologyreview.com/feed/", "https://www.technologyreview.com"),
    ("Nature", "https://www.nature.com/nature.rss", "https://www.nature.com"),
    ("arXiv cs.CV", "https://rss.arxiv.org/rss/cs.CV", "https://arxiv.org/list/cs.CV/recent"),
    ("arXiv cs.LG", "https://rss.arxiv.org/rss/cs.LG", "https://arxiv.org/list/cs.LG/recent"),
)

GOOGLE_NEWS_REGION = "hl=en-US&gl=US&ceid=US:en"


#/////////////////////////////////////////////////////////
# SEARCH /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _google_news_source(query):
    """A source that follows a search on Google News."""
    encoded_query = quote_plus(query)

    return {
        "platform": "news",
        "title": f"News about {query}",
        "description": "Live topic feed from Google News",
        "url": f"https://news.google.com/search?q={encoded_query}&{GOOGLE_NEWS_REGION}",
        "feed_url": f"https://news.google.com/rss/search?q={encoded_query}&{GOOGLE_NEWS_REGION}",
        "thumbnail": "",
    }


def search_outlets(query):
    query = query.strip()
    needle = query.lower()

    results = []

    for name, feed_url, website_url in NEWS_OUTLETS:
        matches = needle in name.lower() or needle in website_url.lower()
        if not matches:
            continue

        results.append({
            "platform": "news",
            "title": name,
            "description": feed_url,
            "url": website_url,
            "feed_url": feed_url,
            "thumbnail": "",
        })

    results.append(_google_news_source(query))
    return results
