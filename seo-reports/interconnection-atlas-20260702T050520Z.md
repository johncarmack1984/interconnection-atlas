# SEO/GEO audit - interconnection-atlas

`https://johncarmack1984.github.io/interconnection-atlas/` | generated 20260702T050520Z | positioning: interconnection-atlas is a free, open-source interactive D3 map of the US grid interconnection queue: a hosting-capacity choropleth with queue projects and ISO/RTO territories, running fully in-browser on real EIA-860M + HIFLD data (with a synthetic mode), by johncarmack1984.

## Findings (ranked)

- [HIGH] `crawl:schema.missing` - No JSON-LD structured data in server HTML (no Person/ProfilePage entity for Google or LLMs).
- [HIGH] `crawl:render.thin_shell` - Server HTML has only 6 words of text - looks like an unprerendered SPA shell (install the 'render' extra to quantify the JS-gap precisely).
- [MED] `crawl:description.missing` - No meta description.
- [MED] `crawl:sitemap.missing` - No /sitemap.xml (200).
- [MED] `github:github.no_topics` - repo has no topics (GitHub search keywords - add your niche terms).
- [LOW] `crawl:canonical.missing` - No rel=canonical link.
- [LOW] `gsc:gsc.no_property` - surface has no gsc_property set.
- [LOW] `bing:bing.error` - Bing API returned 400 (is the site verified for this key?).
- [LOW] `trends:trends.no_seeds` - surface has no seed_keywords.
- [LOW] `serper:serper.no_seeds` - surface has no seed_keywords; skipping.
- [LOW] `geo_probe:geo.no_config` - set surface_markers + geo_probes on the surface (surfaces.toml) to run GEO probes; skipping.

## Signals by provider

### crawl - Tier 0 (free) - ok
- **final_url**: https://johncarmack1984.github.io/interconnection-atlas/
- **status**: 200
- **title**: US Interconnection Atlas · D3 demo
- **title_len**: 34
- **meta_description**: 
- **canonical**: None
- **html_lang**: en
- **og_tags**: 0
- **twitter_tags**: 0
- **h1_raw**: (none)
- **raw_html_words**: 6
- **jsonld_types_raw**: (none)
- **rendered**: skipped (install 'render' extra for the JS-gap)
- **robots_txt**: 404
- **sitemap_xml**: 404

### psi - Tier 0 (free) - ok
- **performance_score**: 95
- **LCP**: 2.1 s
- **CLS**: 0
- **TBT**: 0 ms
- **SpeedIndex**: 4.0 s

### gsc - Tier 0 (free) - skipped

### github - Tier 0 (free) - ok
- **description**: Interactive D3 map of US grid interconnection: a hosting-capacity choropleth with the interconnection queue and ISO/RTO territories overlaid (synthetic demo data).
- **topics**: (none)
- **stars**: 0
- **homepage**: https://johncarmack1984.github.io/interconnection-atlas/
- **views_14d**: 0
- **uniques_14d**: 0

### bing - Tier 0 (free) - ok
- **bing**: HTTP 400

### trends - Tier 0 (free) - skipped

### dataforseo - Tier 1 (SERP/volume) - skipped

### serper - Tier 1 (SERP/volume) - skipped

### geo_probe - Tier 2 (GEO probes) - skipped

## Available if promoted (paid tiers, currently stubbed)

- **ahrefs** (Tier 3 (backlinks)): Backlink profile + referring domains + organic keyword/competitor gap - needs `AHREFS_API_KEY`
- **semrush** (Tier 3 (backlinks)): Domain/organic research + backlinks + competitor keyword gap (Semrush) - needs `SEMRUSH_API_KEY`
