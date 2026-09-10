package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"anime-scraper/providers"
	_ "anime-scraper/providers/allanime"
	_ "anime-scraper/providers/animepahe"
	_ "anime-scraper/providers/anineko"
	_ "anime-scraper/providers/anipub"
	_ "anime-scraper/providers/senshi"
)

type StreamRequest struct {
	ShowID    string `json:"showId"`
	Episode   int    `json:"episode"`
	Mode      string `json:"mode"` // "sub" or "dub"
	Provider  string `json:"provider"` // optional: specific provider name
}

type StreamResponse struct {
	Streams []StreamInfo `json:"streams"`
	Error   string       `json:"error,omitempty"`
}

type StreamInfo struct {
	URL      string `json:"url"`
	Quality  string `json:"quality"`
	Provider string `json:"provider"`
	Referrer string `json:"referrer,omitempty"`
}

type SearchRequest struct {
	Query string `json:"query"`
	Mode  string `json:"mode"`
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error,omitempty"`
}

type SearchResult struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
	Provider  string `json:"provider"`
}
func getProviders() []providers.Provider {
	names := providers.RegisteredNames()
	var result []providers.Provider
	for _, name := range names {
		if p, err := providers.New(name); err == nil {
			result = append(result, p)
		}
	}
	return result
}

func handleResolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req StreamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(StreamResponse{Error: "Invalid request body"})
		return
	}

	if req.ShowID == "" || req.Episode == 0 {
		json.NewEncoder(w).Encode(StreamResponse{Error: "Missing showId or episode"})
		return
	}

	if req.Mode == "" {
		req.Mode = "sub"
	}

	config := providers.PlaybackConfig{
		SubOrDub: req.Mode,
		SubStyle: "soft",
	}

	allProviders := getProviders()
	var streams []StreamInfo

	// Try specific provider if requested, otherwise try all in order
	for _, p := range allProviders {
		if req.Provider != "" && p.Name() != req.Provider {
			continue
		}

		log.Printf("[Resolve] Trying provider %s for show %s ep %d", p.Name(), req.ShowID, req.Episode)

		urls, err := p.GetEpisodeURL(config, req.ShowID, req.Episode)
		if err != nil {
			log.Printf("[Resolve] Provider %s failed: %v", p.Name(), err)
			continue
		}

		for i, url := range urls {
			streams = append(streams, StreamInfo{
				URL:      url,
				Quality:  fmt.Sprintf("auto-%d", i),
				Provider: p.Name(),
			})
		}

		if len(streams) > 0 {
			break // Use first provider that returns results
		}
	}

	if len(streams) == 0 {
		json.NewEncoder(w).Encode(StreamResponse{Error: "No streams found from any provider"})
		return
	}

	json.NewEncoder(w).Encode(StreamResponse{Streams: streams})
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(SearchResponse{Error: "Invalid request body"})
		return
	}

	if req.Query == "" {
		json.NewEncoder(w).Encode(SearchResponse{Error: "Missing query"})
		return
	}

	if req.Mode == "" {
		req.Mode = "sub"
	}

	allProviders := getProviders()
	var results []SearchResult

	for _, p := range allProviders {
		log.Printf("[Search] Trying provider %s for query %q", p.Name(), req.Query)

		options, err := p.SearchAnime(req.Query, req.Mode)
		if err != nil {
			log.Printf("[Search] Provider %s failed: %v", p.Name(), err)
			continue
		}

		for _, opt := range options {
			results = append(results, SearchResult{
				Key:       opt.Key,
				Label:     opt.Label,
				Title:     opt.Title,
				Thumbnail: opt.Thumbnail,
				Provider:  p.Name(),
			})
		}
	}

	json.NewEncoder(w).Encode(SearchResponse{Results: results})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"providers": len(getProviders()),
	})
}

func main() {
	port := os.Getenv("SCRAPER_PORT")
	if port == "" {
		port = "9798"
	}

	http.HandleFunc("/resolve", handleResolve)
	http.HandleFunc("/search", handleSearch)
	http.HandleFunc("/health", handleHealth)

	addr := "127.0.0.1:" + port
	log.Printf("Anime scraper sidecar (curd providers) listening on http://%s", addr)
	log.Printf("Available providers: %d", len(getProviders()))

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}