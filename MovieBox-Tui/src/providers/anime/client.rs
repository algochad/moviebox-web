use reqwest::Client;
use serde::Deserialize;

use crate::providers::models::{
    AudioTrackOption, CatalogItem, Episode, MediaDetails, MediaType,
    ProviderError, ProviderKind, ProviderMediaId, Release, Season,
};
use crate::providers::ProviderCapabilities;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};


const ALLANIME_CRYPTO_ENDPOINT: &str = "https://www.allanime.day";
const ALLANIME_API_ENDPOINT: &str = "https://api.allanime.day/api";
const ALLANIME_QUERY_HASH: &str = "f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0";

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
    status
    availableEpisodesDetail
    studios
    episodeCount
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
    season: Option<serde_json::Value>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    available_episodes_detail: Option<serde_json::Value>,
    #[serde(default)]
    studios: Option<Vec<String>>,
    #[serde(default)]
    episode_count: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
struct AllAnimeSeason {
    #[serde(default)]
    year: Option<i64>,
    #[serde(default)]
    quarter: Option<String>,
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
            .and_then(|v| v.get("sub"))
            .and_then(|v| v.as_array())
            .map(|arr| arr.len())
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
            year: card.season.as_ref().and_then(|s| s.get("year")).and_then(|v| v.as_i64()).map(|y| y.to_string()),
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
            year: card.season.as_ref().and_then(|s| s.get("year")).and_then(|v| v.as_i64()).map(|y| y.to_string()),
            description: Self::clean_description(card.description.clone()),
            tagline: card.season.as_ref().map(|s| {
                let quarter = s.get("quarter").and_then(|v| v.as_str()).unwrap_or("");
                let year = s.get("year").and_then(|v| v.as_i64()).map(|y| format!(" {y}")).unwrap_or_default();
                format!("{quarter}{year}")
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

    async fn fetch_allanime_crypto_keys(&self) -> Result<(Vec<u8>, i64), ProviderError> {
        let html = self.http.get(ALLANIME_CRYPTO_ENDPOINT)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send().await
            .map_err(|e| ProviderError::Network(e.to_string()))?
            .text().await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        let epoch_re = regex::Regex::new(r#""epoch":(\d+)"#).unwrap();
        let epoch: i64 = epoch_re.captures(&html)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
            .ok_or_else(|| ProviderError::Parsing("Failed to extract epoch".to_string()))?;

        let partb_re = regex::Regex::new(r#""partB":"([^"]+)"#).unwrap();
        let partb_b64 = partb_re.captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or_else(|| ProviderError::Parsing("Failed to extract partB".to_string()))?;

        let partb_bytes = general_purpose::STANDARD.decode(partb_b64)
            .map_err(|_| ProviderError::Parsing("Failed to decode partB".to_string()))?;

        let app_js_re = regex::Regex::new(r#"src="(/_app/immutable/entry/app\.[^"]+\.js)""#).unwrap();
        let app_js_path = app_js_re.captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or_else(|| ProviderError::Parsing("Failed to find app.js".to_string()))?;
        
        let app_js_url = format!("{}{}", ALLANIME_CRYPTO_ENDPOINT, app_js_path);
        let app_js_content = self.http.get(&app_js_url)
            .header("User-Agent", "Mozilla/5.0")
            .send().await
            .map_err(|e| ProviderError::Network(e.to_string()))?
            .text().await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        let chunk_re = regex::Regex::new(r#"\.\./chunks/([A-Za-z0-9_.-]+\.js)"#).unwrap();
        let chunks: Vec<String> = chunk_re.captures_iter(&app_js_content)
            .take(5)
            .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
            .collect();

        let mut mask_hex = String::new();
        for chunk in chunks {
            let chunk_url = format!("{}/_app/immutable/chunks/{}", ALLANIME_CRYPTO_ENDPOINT, chunk);
            if let Ok(resp) = self.http.get(&chunk_url).header("User-Agent", "Mozilla/5.0").send().await {
                if let Ok(text) = resp.text().await {
                    if let Some(cap) = regex::Regex::new(r"[0-9a-f]{64}").unwrap().find(&text) {
                        mask_hex = cap.as_str().to_string();
                        break;
                    }
                }
            }
        }

        if mask_hex.is_empty() {
            return Err(ProviderError::Parsing("Failed to extract mask".to_string()));
        }

        let mask_bytes = hex::decode(&mask_hex)
            .map_err(|_| ProviderError::Parsing("Failed to decode mask".to_string()))?;

        let mut key_bytes = vec![0u8; 32];
        for i in 0..32.min(mask_bytes.len()).min(partb_bytes.len()) {
            key_bytes[i] = mask_bytes[i] ^ partb_bytes[i];
        }

        Ok((key_bytes, epoch))
    }

    fn compute_aa_req(&self, key: &[u8], epoch: i64, query_hash: &str) -> Result<String, ProviderError> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let now_secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let ts = (now_secs / 300) * 300 * 1000;
        
        let nonce_input = format!("{}:{}:{}", epoch, query_hash, ts);
        let mut hasher = Sha256::new();
        hasher.update(nonce_input.as_bytes());
        let nonce_hash = hasher.finalize();
        let nonce_bytes = &nonce_hash[0..12];

        let payload = serde_json::json!({
            "v": 1,
            "ts": ts,
            "epoch": epoch,
            "qh": query_hash
        });
        let payload_str = serde_json::to_string(&payload).unwrap();

        let unbound_key = UnboundKey::new(&AES_256_GCM, key)
            .map_err(|_| ProviderError::Parsing("Invalid AES key".to_string()))?;
        let key = LessSafeKey::new(unbound_key);
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| ProviderError::Parsing("Invalid nonce".to_string()))?;

        let mut in_out = payload_str.into_bytes();
        key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| ProviderError::Parsing("AES encryption failed".to_string()))?;

        let mut output = vec![0x01];
        output.extend_from_slice(nonce_bytes);
        output.extend_from_slice(&in_out);

        Ok(general_purpose::STANDARD.encode(&output))
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
        // AllAnime streaming requires dynamic JS execution or updated crypto that changes frequently.
        // Gogoanime domains are dead. AniDB.app is behind Cloudflare.
        // For now, return a clear error explaining the situation.
        Err(ProviderError::Unavailable(
            "Anime streaming is temporarily unavailable due to provider changes (Gogoanime dead, AllAnime requires dynamic crypto). Metadata, search, and trending work fine. Direct streaming will be restored when a stable provider is available.".to_string()
        ))
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
