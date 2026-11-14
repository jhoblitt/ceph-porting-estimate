package data

// Model is one priced model from models.yaml.
type Model struct {
	ID            string       `yaml:"id"              json:"id"`
	Name          string       `yaml:"name"            json:"name"`
	Vendor        string       `yaml:"vendor"          json:"vendor"`
	Source        string       `yaml:"source"          json:"source"`
	ReadOn        string       `yaml:"read_on"         json:"read_on"`
	USDPerMTok    Prices       `yaml:"usd_per_mtok"    json:"usd_per_mtok"`
	CacheWriteTTL TTLLabels    `yaml:"cache_write_ttl" json:"cache_write_ttl"`
	LongContext   *LongContext `yaml:"long_context"    json:"long_context"`
	// PriceSources, when a model's prices were read from more than one
	// page, says which page each usd_per_mtok price came from; Source and
	// ReadOn then name the page the row is cited by.
	PriceSources []PriceSource `yaml:"price_sources,omitempty" json:"price_sources,omitempty"`
}

// PriceSource is the page one or more of a model's prices were read from.
type PriceSource struct {
	// Prices are usd_per_mtok keys: input, cache_write_short and so on.
	Prices []string `yaml:"prices"  json:"prices"`
	Source string   `yaml:"source"  json:"source"`
	ReadOn string   `yaml:"read_on" json:"read_on"`
	// Note is what a reader should know about reading these prices there,
	// such as an inference the page does not state.
	Note string `yaml:"note,omitempty" json:"note,omitempty"`
}

// Prices are US dollars per million tokens; nil means the key was missing.
type Prices struct {
	Input           *float64 `yaml:"input"             json:"input"`
	CacheWriteShort *float64 `yaml:"cache_write_short" json:"cache_write_short"`
	CacheWriteLong  *float64 `yaml:"cache_write_long"  json:"cache_write_long"`
	CacheRead       *float64 `yaml:"cache_read"        json:"cache_read"`
	Output          *float64 `yaml:"output"            json:"output"`
}

// TTLLabels name the two cache-write lifetimes for the UI.
type TTLLabels struct {
	Short string `yaml:"short" json:"short"`
	Long  string `yaml:"long"  json:"long"`
}

// LongContext is the price sheet above a prompt-size threshold.
type LongContext struct {
	ThresholdTokens *int64 `yaml:"threshold_tokens" json:"threshold_tokens"`
	Prices          `yaml:",inline"`
}

type modelsFile struct {
	Models []Model `yaml:"models"`
}
