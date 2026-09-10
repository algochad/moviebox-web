use reqwest::Client;
use serde::Deserialize;

use crate::providers::models::{
    AudioTrackOption, CatalogItem, Episode, MediaDetails, MediaType,
    ProviderError, ProviderKind, ProviderMediaId, Release, Season,
};
use crate::providers::ProviderCapabilities;

const ANILIST_ENDPOINT: &str = "https://graphql.anilist.co";

const SEARCH_QUERY: &str = r#"
query ($page: Int, $perPage: Int, $search: String) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english native }
      coverImage { large }
      bannerImage
      description
      genres
      season
      seasonYear
      episodes
      status
    }
  }
}
"#;

const DETAILS_QUERY: &str = r#"
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    description
    genres
    studios { nodes { name } }
    season
    seasonYear
    episodes
    status
    relations {
      edges {
        relationType
        node { id idMal title { romaji } }
      }
    }
  }
}
"#;

const SEASONAL_QUERY: &str = r#"
query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
  Page(page: $page, perPage: $perPage) {
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english native }
      coverImage { large }
      bannerImage
      description
      genres
      season
      seasonYear
      episodes
      status
    }
  }
}
"#;

const ALLANIME_ENDPOINT: &str = "https://api.allanime.day/api";

const ALLANIME_POPULAR_QUERY: &str = r#"
query($type: VaildPopularTypeEnumType!, $page: Int!, $size: Int!, $dateRange: Int) {
  queryPopular(type: $type, page: $page, size: $size, dateRange: $dateRange) {
    recommendations {
      anyCard {
        _id
        name
        englishName
        thumbnail
        banner
        availableEpisodesDetail
      }
    }
  }
}
"#;

const ALLANIME_SEARCH_QUERY: &str = r#"
query($q: String!, $page: Int!, $limit: Int!) {
  shows(search: { query: $q }, page: $page, limit: $limit) {
    edges {
      _id
      name
      englishName
      thumbnail
      banner
      availableEpisodesDetail
    }
  }
}
"#;

const ALLANIME_DETAILS_QUERY: &str = r#"
query($id: String!) {
  show(_id: $id) {
    _id
    name
    englishName
    thumbnail
    banner
    description
    genres
    season
    year
    availableEpisodesDetail
    studios
  }
}
"#;

#[derive(Debug, Deserialize)]
struct AllAnimeResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Debug, Deserialize)]
struct AllAnimePopularData {
    #[serde(rename = "queryPopular")]
    query_popular: Option<AllAnimePopular>,
}

#[derive(Debug, Deserialize)]
struct AllAnimePopular {
    recommendations: Vec<AllAnimeRecommendation>,
}

#[derive(Debug, Deserialize)]
struct AllAnimeRecommendation {
    #[serde(rename = "anyCard")]
    any_card: Option<AllAnimeCard>,
}

#[derive(Debug, Deserialize)]
struct AllAnimeSearchData {
    shows: Option<AllAnimeShows>,
}

#[derive(Debug, Deserialize)]
struct AllAnimeShows {
    edges: Vec<AllAnimeCard>,
}

#[derive(Debug, Deserialize)]
struct AllAnimeDetailsData {
    show: Option<AllAnimeCard>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AllAnimeCard {
    #[serde(rename = "_id")]
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    english_name: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    banner: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    genres: Option<Vec<String>>,
    #[serde(default)]
    season: Option<String>,
    #[serde(default)]
    year: Option<i64>,
    #[serde(default)]
    available_episodes_detail: Option<AllAnimeEpisodes>,
    #[serde(default)]
    studios: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
struct AllAnimeEpisodes {
    #[serde(default)]
    sub: Vec<String>,
    #[serde(default)]
    dub: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GraphQlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct PageData {
    media: Vec<AniListMedia>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AniListMedia {
    id: i64,
    #[serde(default)]
    title: AniListTitle,
    cover_image: Option<AniListCover>,
    #[serde(default)]
    banner_image: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    genres: Vec<String>,
    #[serde(default)]
    season: Option<String>,
    #[serde(default)]
    season_year: Option<i64>,
    #[serde(default)]
    episodes: Option<i64>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    studios: Option<AniListStudios>,
}

#[derive(Debug, Deserialize, Default)]
struct AniListTitle {
    #[serde(default)]
    romaji: Option<String>,
    #[serde(default)]
    english: Option<String>,
    #[serde(default)]
    native: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AniListCover {
    #[serde(default)]
    large: Option<String>,
    #[serde(default)]
    extra_large: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AniListStudios {
    #[serde(default)]
    nodes: Vec<AniListStudio>,
}

#[derive(Debug, Deserialize)]
struct AniListStudio {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Clone)]
pub struct AnimeProvider {
    http: Client,
}

impl AnimeProvider {
    pub fn new(http: Client) -> Self {
        Self { http }
    }

    fn pick_title(title: &AniListTitle) -> String {
        title
            .english
            .clone()
            .or_else(|| title.romaji.clone())
            .or_else(|| title.native.clone())
            .unwrap_or_else(|| "Unknown Anime".to_string())
    }

    fn year_text(media: &AniListMedia) -> Option<String> {
        media.season_year.map(|y| y.to_string())
    }

    fn episodes_count(media: &AniListMedia) -> usize {
        media.episodes.map(|e| e.max(0) as usize).unwrap_or(0)
    }

    fn seasons_for(media: &AniListMedia) -> Vec<Season> {
        let count = Self::episodes_count(media);
        if count == 0 {
            return Vec::new();
        }
        let episodes = (1..=count)
            .map(|number| Episode {
                season: 1,
                number,
                title: None,
            })
            .collect();
        vec![Season {
            number: 1,
            episodes,
        }]
    }

    fn clean_description(raw: Option<String>) -> Option<String> {
        raw.map(|text| {
            text.replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<br />", "\n")
                .replace("</p>", "\n\n")
                .replace("<i>", "")
                .replace("</i>", "")
                .replace("<b>", "")
                .replace("</b>", "")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#039;", "'")
                .replace("&nbsp;", " ")
                .trim()
                .to_string()
        })
        .filter(|text| !text.is_empty())
    }

    fn media_id(media: &AniListMedia) -> ProviderMediaId {
        ProviderMediaId {
            provider: ProviderKind::Anime,
            value: media.id.to_string(),
        }
    }

    fn to_catalog_item(media: &AniListMedia) -> CatalogItem {
        CatalogItem {
            id: Self::media_id(media),
            title: Self::pick_title(&media.title),
            media_type: MediaType::Anime,
            year: Self::year_text(media),
            poster_url: media
                .cover_image
                .as_ref()
                .and_then(|c| c.large.clone())
                .or_else(|| media.banner_image.clone()),
            season_count: if Self::episodes_count(media) > 1 {
                Some(1)
            } else {
                None
            },
        }
    }

    fn to_details(media: &AniListMedia) -> MediaDetails {
        let episodes_count = Self::episodes_count(media);
        let duration = if episodes_count > 1 {
            Some(format!("{episodes_count} episodes"))
        } else {
            None
        };
        let director = media
            .studios
            .as_ref()
            .and_then(|s| s.nodes.first())
            .and_then(|n| n.name.clone());

        MediaDetails {
            id: Self::media_id(media),
            title: Self::pick_title(&media.title),
            media_type: MediaType::Anime,
            year: Self::year_text(media),
            description: Self::clean_description(media.description.clone()),
            tagline: media.season.clone().map(|season| {
                let year = media
                    .season_year
                    .map(|y| format!(" {y}"))
                    .unwrap_or_default();
                format!("{season}{year}")
            }),
            imdb_rating: None,
            director,
            stars: None,
            prints: None,
            audios: None,
            poster_url: media
                .cover_image
                .as_ref()
                .and_then(|c| c.extra_large.clone().or_else(|| c.large.clone()))
                .or_else(|| media.banner_image.clone()),
            duration,
            genres: media.genres.clone(),
            seasons: Self::seasons_for(media),
            dubs: Vec::<AudioTrackOption>::new(),
        }
    }

    async fn post_graphql<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T, ProviderError> {
        let body = serde_json::json!({
            "query": query,
            "variables": variables,
        });
        let response = self
            .http
            .post(ANILIST_ENDPOINT)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", "ArchlastCine/1.0 (anime-provider)")
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        let status = response.status();
        if status.as_u16() == 429 {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            return Err(ProviderError::RateLimited(retry_after));
        }
        if !status.is_success() {
            return Err(ProviderError::Unavailable(format!(
                "AniList returned HTTP {status}"
            )));
        }

        let parsed: GraphQlResponse<T> = response
            .json()
            .await
            .map_err(|e| ProviderError::Parsing(e.to_string()))?;

        if let Some(errors) = parsed.errors {
            if !errors.is_empty() {
                let message = errors
                    .into_iter()
                    .map(|e| e.message)
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(ProviderError::Parsing(message));
            }
        }

        parsed.data.ok_or_else(|| {
            ProviderError::Parsing("AniList response contained no data".to_string())
        })
    }

    async fn post_allanime_graphql<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T, ProviderError> {
        let body = serde_json::json!({
            "query": query,
            "variables": variables,
        });
        let response = self
            .http
            .post(ALLANIME_ENDPOINT)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", "Mozilla/5.0 (ArchlastCine anime-provider)")
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            return Err(ProviderError::Unavailable(format!(
                "AllAnime returned HTTP {status}"
            )));
        }

        let parsed: AllAnimeResponse<T> = response
            .json()
            .await
            .map_err(|e| ProviderError::Parsing(e.to_string()))?;

        if let Some(errors) = parsed.errors {
            if !errors.is_empty() {
                let message = errors
                    .into_iter()
                    .map(|e| e.message)
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(ProviderError::Parsing(message));
            }
        }

        parsed.data.ok_or_else(|| {
            ProviderError::Parsing("AllAnime response contained no data".to_string())
        })
    }

    fn allanime_pick_title(card: &AllAnimeCard) -> String {
        card.english_name
            .clone()
            .or_else(|| card.name.clone())
            .unwrap_or_else(|| "Unknown Anime".to_string())
    }

    fn allanime_episodes_count(card: &AllAnimeCard) -> usize {
        card.available_episodes_detail
            .as_ref()
            .map(|ep| ep.sub.len().max(ep.dub.len()))
            .unwrap_or(0)
    }

    fn allanime_seasons_for(card: &AllAnimeCard) -> Vec<Season> {
        let count = Self::allanime_episodes_count(card);
        if count == 0 {
            return Vec::new();
        }
        let episodes = (1..=count)
            .map(|number| Episode {
                season: 1,
                number,
                title: None,
            })
            .collect();
        vec![Season {
            number: 1,
            episodes,
        }]
    }

    fn allanime_media_id(card: &AllAnimeCard) -> ProviderMediaId {
        ProviderMediaId {
            provider: ProviderKind::Anime,
            value: card.id.clone(),
        }
    }

    fn allanime_to_catalog_item(card: &AllAnimeCard) -> CatalogItem {
        CatalogItem {
            id: Self::allanime_media_id(card),
            title: Self::allanime_pick_title(card),
            media_type: MediaType::Anime,
            year: card.year.map(|y| y.to_string()),
            poster_url: card.thumbnail.clone().or_else(|| card.banner.clone()),
            season_count: if Self::allanime_episodes_count(card) > 1 {
                Some(1)
            } else {
                None
            },
        }
    }

    fn allanime_to_details(card: &AllAnimeCard) -> MediaDetails {
        let episodes_count = Self::allanime_episodes_count(card);
        let duration = if episodes_count > 1 {
            Some(format!("{episodes_count} episodes"))
        } else {
            None
        };
        let director = card.studios.as_ref().and_then(|s| s.first().cloned());

        MediaDetails {
            id: Self::allanime_media_id(card),
            title: Self::allanime_pick_title(card),
            media_type: MediaType::Anime,
            year: card.year.map(|y| y.to_string()),
            description: Self::clean_description(card.description.clone()),
            tagline: card.season.clone().map(|season| {
                let year = card.year.map(|y| format!(" {y}")).unwrap_or_default();
                format!("{season}{year}")
            }),
            imdb_rating: None,
            director,
            stars: None,
            prints: None,
            audios: None,
            poster_url: card.thumbnail.clone().or_else(|| card.banner.clone()),
            duration,
            genres: card.genres.clone().unwrap_or_default(),
            seasons: Self::allanime_seasons_for(card),
            dubs: Vec::<AudioTrackOption>::new(),
        }
    }

    /// Seasonal catalog: anime airing in the given season/year, most popular
    /// first. `season` is the calendar season ("winter" | "spring" |
    /// "summer" | "fall"); AniList semantics map it onto `MediaSeason`.
    pub async fn seasonal(
        &self,
        season: &str,
        year: i64,
        page: usize,
    ) -> Result<Vec<CatalogItem>, ProviderError> {
        let season_key = season.trim().to_ascii_uppercase();
        if !matches!(
            season_key.as_str(),
            "WINTER" | "SPRING" | "SUMMER" | "FALL"
        ) {
            return Err(ProviderError::Unavailable(format!(
                "invalid season: {season} (expected winter/spring/summer/fall)"
            )));
        }
        let page_data: PageData = self
            .post_graphql(
                SEASONAL_QUERY,
                serde_json::json!({
                    "page": page.max(1),
                    "perPage": 50,
                    "season": season_key,
                    "seasonYear": year,
                }),
            )
            .await?;
        Ok(page_data.media.iter().map(Self::to_catalog_item).collect())
    }

    /// Browse anime by sort order (TRENDING_DESC, POPULARITY_DESC, START_DATE_DESC).
    /// Optional status filter (e.g., "RELEASING" for currently airing).
    pub async fn browse(
        &self,
        sort: &str,
        status: Option<&str>,
        page: usize,
    ) -> Result<Vec<CatalogItem>, ProviderError> {
        let browse_query = r#"
query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: $sort, status: $status) {
      id
      idMal
      title { romaji english native }
      coverImage { large }
      bannerImage
      description
      genres
      season
      seasonYear
      episodes
      status
    }
  }
}
"#;
        let mut variables = serde_json::json!({
            "page": page.max(1),
            "perPage": 50,
            "sort": [sort],
        });
        if let Some(s) = status {
            variables["status"] = serde_json::json!(s);
        }
        let page_data: PageData = match self.post_graphql(browse_query, variables.clone()).await {
            Ok(data) => data,
            Err(_) => {
                // Fallback to AllAnime for trending/popular/recent
                let allanime_data: AllAnimePopularData = self
                    .post_allanime_graphql(
                        ALLANIME_POPULAR_QUERY,
                        serde_json::json!({
                            "type": "anime",
                            "page": page.max(1),
                            "size": 50,
                            "dateRange": 7,
                        }),
                    )
                    .await?;
                let cards: Vec<CatalogItem> = allanime_data
                    .query_popular
                    .map(|p| {
                        p.recommendations
                            .iter()
                            .filter_map(|r| r.any_card.as_ref())
                            .map(Self::allanime_to_catalog_item)
                            .collect()
                    })
                    .unwrap_or_default();
                return Ok(cards);
            }
        };
        Ok(page_data.media.iter().map(Self::to_catalog_item).collect())
    }
}

impl crate::providers::Provider for AnimeProvider {
    fn id(&self) -> ProviderKind {
        ProviderKind::Anime
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            supports_search: true,
            supports_pagination: true,
            supports_series: true,
            supports_subtitles: false,
            supports_homepage: false,
        }
    }

    async fn search(&self, query: &str, page: usize) -> Result<Vec<CatalogItem>, ProviderError> {
        let result = self
            .post_graphql::<PageData>(
                SEARCH_QUERY,
                serde_json::json!({
                    "page": page.max(1),
                    "perPage": 25,
                    "search": query,
                }),
            )
            .await;
        match result {
            Ok(page_data) => Ok(page_data.media.iter().map(Self::to_catalog_item).collect()),
            Err(_) => {
                // Fallback to AllAnime search
                let allanime_data: AllAnimeSearchData = self
                    .post_allanime_graphql(
                        ALLANIME_SEARCH_QUERY,
                        serde_json::json!({
                            "q": query,
                            "page": page.max(1),
                            "limit": 25,
                        }),
                    )
                    .await?;
                let cards: Vec<CatalogItem> = allanime_data
                    .shows
                    .map(|s| s.edges.iter().map(Self::allanime_to_catalog_item).collect())
                    .unwrap_or_default();
                Ok(cards)
            }
        }
    }

    async fn details(&self, id: &str) -> Result<MediaDetails, ProviderError> {
        // Try AniList first (numeric ID)
        if let Ok(anilist_id) = id.trim().parse::<i64>() {
            if let Ok(media) = self
                .post_graphql::<AniListMedia>(
                    DETAILS_QUERY,
                    serde_json::json!({ "id": anilist_id }),
                )
                .await
            {
                if media.id == anilist_id {
                    return Ok(Self::to_details(&media));
                }
            }
        }
        // Fallback to AllAnime (string ID)
        let allanime_data: AllAnimeDetailsData = self
            .post_allanime_graphql(
                ALLANIME_DETAILS_QUERY,
                serde_json::json!({ "id": id }),
            )
            .await?;
        let card = allanime_data.show.ok_or(ProviderError::NotFound)?;
        Ok(Self::allanime_to_details(&card))
    }
}

impl crate::providers::ReleaseProvider for AnimeProvider {
    async fn episode_streams(
        &self,
        id: &str,
        _season: usize,
        episode: usize,
    ) -> Result<Vec<Release>, ProviderError> {
        let details = crate::providers::Provider::details(self, id).await?;
        let title = details.title.clone();
        let slug = title.to_lowercase().replace(' ', "-").replace(':', "").replace('\'', "");

        // Phase 1: fetch all HTML pages (async, no scraper types held across awaits)
        let search_url = format!("https://anitaku.pe/search.html?keyword={}", urlencoding::encode(&slug));
        let search_html = self.http.get(&search_url).send().await
            .map_err(|e| ProviderError::Network(e.to_string()))?
            .text().await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        // Phase 2: parse search HTML in spawn_blocking (scraper is !Send)
        let anime_id = tokio::task::spawn_blocking(move || {
            let document = scraper::Html::parse_document(&search_html);
            let selector = scraper::Selector::parse("div.last_episodes ul li div a").unwrap();
            document.select(&selector)
                .next()
                .and_then(|el| el.value().attr("href"))
                .map(|link| link.trim_start_matches("/category/").to_string())
                .ok_or(ProviderError::NotFound)
        }).await.map_err(|e| ProviderError::Network(format!("parse task failed: {e}")))??;

        // Phase 3: fetch episode page
        let episode_url = format!("https://anitaku.pe/{}/episode-{}", anime_id, episode);
        let ep_html = self.http.get(&episode_url).send().await
            .map_err(|e| ProviderError::Network(e.to_string()))?
            .text().await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        // Phase 4: parse episode HTML to get iframe src
        let iframe_src = tokio::task::spawn_blocking(move || {
            let ep_doc = scraper::Html::parse_document(&ep_html);
            let iframe_selector = scraper::Selector::parse("iframe").unwrap();
            ep_doc.select(&iframe_selector)
                .next()
                .and_then(|el| el.value().attr("src"))
                .map(|s| s.to_string())
                .ok_or(ProviderError::NotFound)
        }).await.map_err(|e| ProviderError::Network(format!("parse task failed: {e}")))??;

        // Phase 5: fetch embed page
        let embed_html = self.http.get(&iframe_src).send().await
            .map_err(|e| ProviderError::Network(e.to_string()))?
            .text().await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        // Phase 6: parse embed HTML to extract stream URLs
        let title_clone = title.clone();
        let anime_id_clone = anime_id.clone();
        let releases = tokio::task::spawn_blocking(move || {
            let embed_doc = scraper::Html::parse_document(&embed_html);
            let source_selector = scraper::Selector::parse("source").unwrap();
            let mut releases = Vec::new();

            for source in embed_doc.select(&source_selector) {
                if let Some(src) = source.value().attr("src") {
                    if src.contains(".m3u8") || src.contains(".mp4") {
                        let quality = source.value().attr("label").unwrap_or("Auto").to_string();
                        releases.push(Release {
                            provider: ProviderKind::Anime,
                            filename: format!("{}-ep{}", title_clone, episode),
                            quality: Some(quality),
                            codec: None,
                            language: Some("Japanese".to_string()),
                            size_bytes: None,
                            season: Some(1),
                            episode: Some(episode),
                            resource_id: Some(format!("gogo-{}-{}", anime_id_clone, episode)),
                            mirrors: vec![crate::providers::models::SourceMirror {
                                label: "Gogoanime".to_string(),
                                resolver_url: src.to_string(),
                                headers: Vec::new(),
                                direct_file: true,
                            }],
                        });
                    }
                }
            }

            if releases.is_empty() {
                if let Some(start) = embed_html.find("sources:") {
                    if let Some(end) = embed_html[start..].find("]") {
                        let sources_json = &embed_html[start + 8..start + end + 1];
                        if let Ok(sources) = serde_json::from_str::<Vec<serde_json::Value>>(sources_json) {
                            for source in sources {
                                if let Some(file) = source.get("file").and_then(|v| v.as_str()) {
                                    let quality = source.get("label").and_then(|v| v.as_str()).unwrap_or("Auto").to_string();
                                    releases.push(Release {
                                        provider: ProviderKind::Anime,
                                        filename: format!("{}-ep{}", title_clone, episode),
                                        quality: Some(quality),
                                        codec: None,
                                        language: Some("Japanese".to_string()),
                                        size_bytes: None,
                                        season: Some(1),
                                        episode: Some(episode),
                                        resource_id: Some(format!("gogo-{}-{}", anime_id_clone, episode)),
                                        mirrors: vec![crate::providers::models::SourceMirror {
                                            label: "Gogoanime".to_string(),
                                            resolver_url: file.to_string(),
                                            headers: Vec::new(),
                                            direct_file: true,
                                        }],
                                    });
                                }
                            }
                        }
                    }
                }
            }

            if releases.is_empty() {
                Err(ProviderError::Unavailable("No playable streams found for this episode".to_string()))
            } else {
                Ok(releases)
            }
        }).await.map_err(|e| ProviderError::Network(format!("parse task failed: {e}")))??;

        Ok(releases)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires network access to AniList"]
    async fn search_returns_anime_items() {
        let provider = AnimeProvider::new(Client::new());
        let results = provider.search("naruto", 1).await.unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().all(|item| {
            item.media_type == MediaType::Anime && item.id.provider == ProviderKind::Anime
        }));
    }

    #[tokio::test]
    #[ignore = "requires network access to AniList"]
    async fn details_fetches_full_metadata() {
        let provider = AnimeProvider::new(Client::new());
        // AniList ID 1 = Cowboy Bebop.
        let details = provider.details("1").await.unwrap();
        assert_eq!(details.id.provider, ProviderKind::Anime);
        assert_eq!(details.media_type, MediaType::Anime);
        assert!(!details.title.is_empty());
        assert!(!details.seasons.is_empty());
    }

    #[tokio::test]
    async fn episode_streams_placeholder_returns_empty() {
        let provider = AnimeProvider::new(Client::new());
        let streams = provider.episode_streams("1", 1, 1).await.unwrap();
        assert!(streams.is_empty());
    }
}
