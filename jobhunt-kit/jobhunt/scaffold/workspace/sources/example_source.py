"""An example custom job source. Enable it in jobhunt.yaml:

    sources:
      - type: module
        name: my-board
        path: sources/example_source.py
        url: https://example.com/jobs.json        # any extra keys you add arrive in `spec`

fetch() returns Job objects or plain dicts with the same fields. Required: id, company, title, link.
Optional: locations, posted (YYYY-MM-DD), employment ("intern"/"fulltime"), countries, terms, degrees, sponsor.
The pipeline does the rest: search filters, tracks, de-duplication with other sources, new-job detection.
Make ids stable from day to day and unique: prefix them with something like "myboard-".
"""


def fetch(spec, ctx):
    # data = ctx.get(spec["url"])          # JSON GET with retries; ctx.get(url, raw=True) for HTML
    data = [
        {"id": "123", "company": "Example Co", "title": "Software Engineering Intern, Summer 2027",
         "location": "Austin, TX", "url": "https://example.com/jobs/123"},
    ]
    return [{"id": f"myboard-{x['id']}", "company": x["company"], "title": x["title"],
             "link": x["url"], "locations": [x["location"]]} for x in data]
