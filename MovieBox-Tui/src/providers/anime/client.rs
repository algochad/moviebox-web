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
        let page_data: PageData = self
            .post_graphql(
                SEARCH_QUERY,
                serde_json::json!({
                    "page": page.max(1),
                    "perPage": 25,
                    "search": query,
                }),
            )
            .await?;
        Ok(page_data.media.iter().map(Self::to_catalog_item).collect())
    }

    async fn details(&self, id: &str) -> Result<MediaDetails, ProviderError> {
        let anilist_id: i64 = id.trim().parse().map_err(|_| ProviderError::NotFound)?;
        let media: AniListMedia = self
            .post_graphql(
                DETAILS_QUERY,
                serde_json::json!({ "id": anilist_id }),
            )
            .await?;
        if media.id != anilist_id {
            return Err(ProviderError::NotFound);
        }
        Ok(Self::to_details(&media))
    }
}

impl crate::providers::ReleaseProvider for AnimeProvider {
    async fn episode_streams(
        &self,
        _id: &str,
        _season: usize,
        _episode: usize,
    ) -> Result<Vec<Release>, ProviderError> {
        // Streaming resolution arrives in Milestone 3 (AllAnime/Gogoanime resolvers).
        Ok(Vec::new())
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
