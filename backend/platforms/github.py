import os

import httpx


def search_repositories(query, limit=10):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Vao2/1.0",
    }
    token = os.environ.get("VAO2_GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = httpx.get(
        "https://api.github.com/search/repositories",
        params={"q": query, "per_page": limit, "sort": "stars"},
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()

    return [
        {
            "platform": "github",
            "url": item["html_url"],
            "feed_url": f"{item['html_url']}/releases.atom",
            "title": item["full_name"],
            "description": item.get("description") or f"{item.get('stargazers_count', 0)} stars",
            "thumbnail": (item.get("owner") or {}).get("avatar_url", ""),
        }
        for item in response.json().get("items", [])
        if item.get("html_url") and item.get("full_name")
    ]
