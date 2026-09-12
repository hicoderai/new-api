package perfmetrics

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicPerformanceVisibility(t *testing.T) {
	previousDB := model.DB
	previousSQLitePath, previousMaster := common.SQLitePath, common.IsMasterNode
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	// The optional DSN must point to a disposable, empty test database.
	t.Setenv("SQL_DSN", os.Getenv("PERF_TEST_SQL_DSN"))
	common.SQLitePath = filepath.Join(t.TempDir(), "perf.db")
	common.IsMasterNode = false
	require.NoError(t, model.InitDB())
	db := model.DB
	sqlDB, err := db.DB()
	require.NoError(t, err)
	setting := ratio_setting.GetGroupRatioSetting()
	previousRatios := ratio_setting.GetGroupRatioCopy()
	previousHidden := ratio_setting.GetHiddenGroupsCopy()
	previousMapping := setting.PerformanceGroupMapping.ReadAll()
	previousRules := setting.PerformanceRules.ReadAll()
	previousFallbacks := setting.PerformanceFallbacks.ReadAll()
	previousOptions := common.OptionMap
	common.OptionMap = make(map[string]string)
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMap = previousOptions
		common.SQLitePath, common.IsMasterNode = previousSQLitePath, previousMaster
		common.SetDatabaseTypes(previousMainType, previousLogType)
		setting.GroupRatio.Clear()
		setting.GroupRatio.AddAll(previousRatios)
		setting.HiddenGroups.Clear()
		setting.HiddenGroups.AddAll(previousHidden)
		setting.PerformanceGroupMapping.Clear()
		setting.PerformanceGroupMapping.AddAll(previousMapping)
		setting.PerformanceRules.Clear()
		setting.PerformanceRules.AddAll(previousRules)
		setting.PerformanceFallbacks.Clear()
		setting.PerformanceFallbacks.AddAll(previousFallbacks)
		model.InvalidatePricingCache()
		hotBuckets.Clear()
		_ = sqlDB.Close()
	})

	setting.GroupRatio.Clear()
	setting.GroupRatio.AddAll(map[string]float64{
		"stable": 1, "premium": 1, "spare": 1, "internal": 0,
	})
	setting.HiddenGroups.Clear()
	setting.HiddenGroups.AddAll(map[string]bool{"internal": true})
	setting.PerformanceGroupMapping.Clear()
	setting.PerformanceRules.Clear()
	setting.PerformanceFallbacks.Clear()
	hotBuckets.Clear()
	require.NoError(t, db.AutoMigrate(&model.PerfMetric{}, &model.Option{}, &model.Channel{}, &model.Ability{}, &model.Model{}, &model.Vendor{}))
	require.NoError(t, db.Create(&model.Ability{Model: "shared", Group: "all", ChannelId: 1, Enabled: true}).Error)
	model.InvalidatePricingCache()
	ts := (time.Now().Unix()/3600 - 1) * 3600
	require.NoError(t, db.Create([]model.PerfMetric{
		{
			ModelName: "shared", Group: "stable", BucketTs: ts,
			RequestCount: 2, SuccessCount: 2, TotalLatencyMs: 2000,
			TtftSumMs: 200, TtftCount: 2, OutputTokens: 200, GenerationMs: 2000,
		},
		{
			ModelName: "shared", Group: "internal", BucketTs: ts,
			RequestCount: 3, SuccessCount: 2, TotalLatencyMs: 9000,
			TtftSumMs: 900, TtftCount: 3, OutputTokens: 900, GenerationMs: 9000,
		},
		{
			ModelName: "shared", Group: "premium", BucketTs: ts,
			RequestCount: 1, SuccessCount: 0, TotalLatencyMs: 6000,
			TtftSumMs: 600, TtftCount: 1, OutputTokens: 50, GenerationMs: 1000,
		},
	}).Error)
	stableHot := &atomicBucket{}
	stableHot.add(Sample{Success: false, LatencyMs: 4000, HasTtft: true, TtftMs: 400, OutputTokens: 400, GenerationMs: 2000})
	hotBuckets.Store(bucketKey{model: "shared", group: "stable", bucketTs: ts}, stableHot)
	internalHot := &atomicBucket{}
	internalHot.add(Sample{Success: true, LatencyMs: 5000, HasTtft: true, TtftMs: 500, OutputTokens: 100, GenerationMs: 1000})
	hotBuckets.Store(bucketKey{model: "shared", group: "internal", bucketTs: ts}, internalHot)
	premiumHot := &atomicBucket{}
	premiumHot.add(Sample{Success: true, LatencyMs: 2000, HasTtft: true, TtftMs: 200, OutputTokens: 150, GenerationMs: 1000})
	hotBuckets.Store(bucketKey{model: "shared", group: "premium", bucketTs: ts}, premiumHot)

	// Without the new option, behavior remains compatible with the one-hop
	// mapping: hidden sources may contribute under a public display group.
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceGroupMapping, `{"internal":"stable","spare":"stable"}`))
	hotBuckets.Store(bucketKey{model: "zero-only", group: "stable", bucketTs: ts}, &atomicBucket{})
	zeroOnly, err := Query(QueryParams{Model: "zero-only"})
	require.NoError(t, err)
	assert.Empty(t, zeroOnly.Groups)
	assert.Nil(t, zeroOnly.Overall, "a drained hot bucket must not create zero-valued performance data")
	legacy, err := Query(QueryParams{Model: "shared"})
	require.NoError(t, err)
	require.Len(t, legacy.Groups, 2)
	assert.Equal(t, "premium", legacy.Groups[0].Group)
	assert.Equal(t, "stable", legacy.Groups[1].Group)
	assert.Equal(t, int64(2857), legacy.Groups[1].AvgLatencyMs)
	require.NotNil(t, legacy.Overall)
	assert.Equal(t, int64(3111), legacy.Overall.AvgLatencyMs)
	legacySummary, err := QuerySummaryAll(24)
	require.NoError(t, err)
	require.Len(t, legacySummary.Models, 1)
	assert.Equal(t, int64(9), legacySummary.Models[0].RequestCount)

	// Detail rows are the intersection of public rule groups and the model's
	// actual sellable groups. A source sample must not make unrelated groups
	// appear, and an explicit query for such a group is empty.
	require.NoError(t, db.Create(&model.Ability{Model: "limited", Group: "stable", ChannelId: 2, Enabled: true}).Error)
	require.NoError(t, db.Create([]model.PerfMetric{
		{ModelName: "limited", Group: "internal", BucketTs: ts, RequestCount: 2, SuccessCount: 2, TotalLatencyMs: 1000},
		{ModelName: "limited", Group: "stable", BucketTs: ts, RequestCount: 2, SuccessCount: 2, TotalLatencyMs: 200},
	}).Error)
	model.InvalidatePricingCache()
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"default":["internal"]}`))
	limited, err := Query(QueryParams{Model: "limited"})
	require.NoError(t, err)
	require.Len(t, limited.Groups, 1)
	assert.Equal(t, "stable", limited.Groups[0].Group)
	limitedPremium, err := Query(QueryParams{Model: "limited", Group: "premium"})
	require.NoError(t, err)
	assert.Empty(t, limitedPremium.Groups)
	limitedPremiumSummary, err := QuerySummaryAll(24, "premium")
	require.NoError(t, err)
	for _, item := range limitedPremiumSummary.Models {
		assert.NotEqual(t, "limited", item.ModelName)
	}

	// Fallback is selected once for the whole DB+hot window. It stays on the
	// configured source as soon as any request exists, including failures, and
	// an explicitly empty source list remains intentionally hidden.
	require.NoError(t, db.Create(&model.Ability{Model: "fallback", Group: "stable", ChannelId: 3, Enabled: true}).Error)
	require.NoError(t, db.Create(&model.PerfMetric{
		ModelName: "fallback", Group: "stable", BucketTs: ts,
		RequestCount: 4, SuccessCount: 4, TotalLatencyMs: 4000,
	}).Error)
	model.InvalidatePricingCache()
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"group:stable":["premium"]}`))
	defaultOff, err := Query(QueryParams{Model: "fallback", Group: "stable"})
	require.NoError(t, err)
	assert.Empty(t, defaultOff.Groups)
	defaultOffSummary, err := QuerySummaryAll(24, "stable")
	require.NoError(t, err)
	for _, item := range defaultOffSummary.Models {
		assert.NotEqual(t, "fallback", item.ModelName)
	}

	require.NoError(t, model.UpdateOption("group_ratio_setting.performance_fallbacks", `{"default":true}`))
	assert.True(t, ratio_setting.PerformanceFallbackEnabled("stable"), "saved fallback options must update the config cache")
	require.Error(t, model.UpdateOption("group_ratio_setting.performance_fallbacks", `{"default":null}`))
	var savedFallback model.Option
	require.NoError(t, db.Where(&model.Option{Key: "group_ratio_setting.performance_fallbacks"}).First(&savedFallback).Error)
	assert.JSONEq(t, `{"default":true}`, savedFallback.Value)
	fallback, err := Query(QueryParams{Model: "fallback", Group: "stable"})
	require.NoError(t, err)
	require.Len(t, fallback.Groups, 1)
	assert.Equal(t, int64(1000), fallback.Groups[0].AvgLatencyMs)
	require.NotNil(t, fallback.Overall)
	assert.Equal(t, int64(1000), fallback.Overall.AvgLatencyMs)
	fallbackSummary, err := QuerySummaryAll(24, "stable")
	require.NoError(t, err)
	foundFallback := false
	for _, item := range fallbackSummary.Models {
		if item.ModelName == "fallback" {
			foundFallback = true
			assert.Equal(t, fallback.Groups[0].AvgLatencyMs, item.AvgLatencyMs)
			assert.Equal(t, int64(4), item.RequestCount)
		}
	}
	assert.True(t, foundFallback)

	require.NoError(t, types.LoadFromJsonString(setting.PerformanceFallbacks, `{"default":true,"group:stable":false}`))
	noFallback, err := Query(QueryParams{Model: "fallback", Group: "stable"})
	require.NoError(t, err)
	assert.Empty(t, noFallback.Groups)
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceFallbacks, `{"group:stable":true}`))

	failedSource := &atomicBucket{}
	failedSource.add(Sample{Success: false, LatencyMs: 9000})
	failedTs := ts + 60
	hotBuckets.Store(bucketKey{model: "fallback", group: "premium", bucketTs: failedTs}, failedSource)
	failed, err := Query(QueryParams{Model: "fallback", Group: "stable"})
	require.NoError(t, err)
	require.Len(t, failed.Groups, 1)
	assert.Equal(t, int64(9000), failed.Groups[0].AvgLatencyMs)
	assert.Equal(t, 0.0, failed.Groups[0].SuccessRate)
	assert.Equal(t, []BucketPoint{{Ts: failedTs, AvgLatencyMs: 9000, SuccessRate: 0}}, failed.Groups[0].Series)

	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"group:stable":["premium","internal"]}`))
	partial, err := Query(QueryParams{Model: "limited", Group: "stable"})
	require.NoError(t, err)
	require.Len(t, partial.Groups, 1)
	assert.Equal(t, int64(500), partial.Groups[0].AvgLatencyMs, "one populated source prevents mixing the original group")
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"group:stable":[]}`))
	emptySources, err := Query(QueryParams{Model: "fallback", Group: "stable"})
	require.NoError(t, err)
	assert.Empty(t, emptySources.Groups)

	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"all":[],"group:stable":["premium"]}`))
	noOverall, err := Query(QueryParams{Model: "limited"})
	require.NoError(t, err)
	require.Len(t, noOverall.Groups, 1)
	assert.Equal(t, int64(100), noOverall.Groups[0].AvgLatencyMs)
	assert.Nil(t, noOverall.Overall, "fallback must not change the unfiltered all-source rule")

	require.NoError(t, db.Where("model_name IN ?", []string{"limited", "fallback"}).Delete(&model.PerfMetric{}).Error)
	require.NoError(t, db.Where("model IN ?", []string{"limited", "fallback"}).Delete(&model.Ability{}).Error)
	hotBuckets.Delete(bucketKey{model: "fallback", group: "premium", bucketTs: failedTs})
	model.InvalidatePricingCache()
	setting.PerformanceFallbacks.Clear()

	// Free rules select raw sources directly. A hidden source contributes but
	// never appears by name; unknown sources are retained in config and ignored
	// at runtime; duplicate sources count once.
	rulesJSON := `{
		"default":["stable","unknown","stable"],
		"all":["internal","premium","internal","unknown"],
		"group:stable":["stable","internal","stable"],
		"group:premium":[]
	}`
	require.NoError(t, model.UpdateOption("group_ratio_setting.performance_rules", rulesJSON))
	var saved model.Option
	require.NoError(t, db.Where(&model.Option{Key: "group_ratio_setting.performance_rules"}).First(&saved).Error)
	assert.JSONEq(t, rulesJSON, saved.Value)
	require.Error(t, model.UpdateOption("group_ratio_setting.performance_rules", `{"all":null}`))
	var stillSaved model.Option
	require.NoError(t, db.Where(&model.Option{Key: "group_ratio_setting.performance_rules"}).First(&stillSaved).Error)
	assert.JSONEq(t, rulesJSON, stillSaved.Value, "invalid option values must not replace the saved rule set")

	result, err := Query(QueryParams{Model: "shared"})
	require.NoError(t, err)
	require.Len(t, result.Groups, 3)
	assert.Equal(t, GroupResult{
		Group: "auto", AvgLatencyMs: 2000, AvgTtftMs: 200,
		SuccessRate: float64(2) / 3 * 100, AvgTps: 150,
		Series: []BucketPoint{{Ts: ts, AvgLatencyMs: 2000, AvgTtftMs: 200, SuccessRate: float64(2) / 3 * 100, AvgTps: 150}},
	}, result.Groups[0])
	assert.Equal(t, GroupResult{
		Group: "spare", AvgLatencyMs: 2000, AvgTtftMs: 200,
		SuccessRate: float64(2) / 3 * 100, AvgTps: 150,
		Series: []BucketPoint{{Ts: ts, AvgLatencyMs: 2000, AvgTtftMs: 200, SuccessRate: float64(2) / 3 * 100, AvgTps: 150}},
	}, result.Groups[1], "default rules restore a public active group mapped away by the legacy setting")
	assert.Equal(t, GroupResult{
		Group: "stable", AvgLatencyMs: 2857, AvgTtftMs: 285,
		SuccessRate: 500.0 / 7, AvgTps: 1600.0 / 14,
		Series: []BucketPoint{{Ts: ts, AvgLatencyMs: 2857, AvgTtftMs: 285, SuccessRate: 500.0 / 7, AvgTps: 1600.0 / 14}},
	}, result.Groups[2], "multiple sources use request-weighted raw counters")
	require.NotNil(t, result.Overall)
	assert.Equal(t, int64(3666), result.Overall.AvgLatencyMs, "all excludes stable and counts duplicate internal once")
	assert.Equal(t, float64(4)/6*100, result.Overall.SuccessRate)
	assert.Equal(t, 100.0, result.Overall.AvgTps)
	encoded, err := common.Marshal(result)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "internal", "hidden raw names must never leak")

	summary, err := QuerySummaryAll(24)
	require.NoError(t, err)
	require.Len(t, summary.Models, 1)
	assert.Equal(t, int64(6), summary.Models[0].RequestCount)
	assert.Equal(t, int64(3666), summary.Models[0].AvgLatencyMs)
	assert.Equal(t, 66.67, summary.Models[0].SuccessRate)
	assert.Equal(t, 100.0, summary.Models[0].AvgTps)
	assert.Equal(t, []SuccessRatePoint{{Ts: ts, SuccessRate: 66.67}}, summary.Models[0].RecentSuccessSeries)

	stable, err := Query(QueryParams{Model: "shared", Group: "stable"})
	require.NoError(t, err)
	require.Len(t, stable.Groups, 1)
	require.NotNil(t, stable.Overall)
	assert.Equal(t, stable.Groups[0].AvgLatencyMs, stable.Overall.AvgLatencyMs)
	assert.Equal(t, stable.Groups[0].AvgTtftMs, stable.Overall.AvgTtftMs)
	assert.Equal(t, stable.Groups[0].SuccessRate, stable.Overall.SuccessRate)
	assert.Equal(t, stable.Groups[0].AvgTps, stable.Overall.AvgTps)
	assert.Equal(t, stable.Groups[0].Series, stable.Overall.Series)
	stableSummary, err := QuerySummaryAll(24, "stable")
	require.NoError(t, err)
	require.Len(t, stableSummary.Models, 1)
	assert.Equal(t, int64(7), stableSummary.Models[0].RequestCount)
	assert.Equal(t, stable.Groups[0].AvgLatencyMs, stableSummary.Models[0].AvgLatencyMs)
	assert.Equal(t, 71.43, stableSummary.Models[0].SuccessRate)
	assert.Equal(t, 114.29, stableSummary.Models[0].AvgTps)

	for _, group := range []string{"premium", "internal", "unknown"} {
		empty, err := Query(QueryParams{Model: "shared", Group: group})
		require.NoError(t, err)
		assert.Empty(t, empty.Groups, group)
		assert.Nil(t, empty.Overall, group)
		emptyJSON, err := common.Marshal(empty)
		require.NoError(t, err)
		assert.Contains(t, string(emptyJSON), `"overall":null`, "overall is always present in JSON")
		emptySummary, err := QuerySummaryAll(24, group)
		require.NoError(t, err)
		assert.Empty(t, emptySummary.Models, group)
	}

	// An empty all rule suppresses overall/card data without suppressing detail
	// rows. Its null overall remains observable in the API shape.
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"all":[],"group:stable":["stable"]}`))
	emptyAll, err := Query(QueryParams{Model: "shared"})
	require.NoError(t, err)
	assert.NotEmpty(t, emptyAll.Groups)
	assert.Nil(t, emptyAll.Overall)
	emptyAllJSON, err := common.Marshal(emptyAll)
	require.NoError(t, err)
	assert.Contains(t, string(emptyAllJSON), `"overall":null`)
	emptyAllSummary, err := QuerySummaryAll(24)
	require.NoError(t, err)
	assert.Empty(t, emptyAllSummary.Models)

	// Cross-references name raw sources and are intentionally not recursive.
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"group:stable":["premium"],"group:premium":["stable"]}`))
	crossStable, err := Query(QueryParams{Model: "shared", Group: "stable"})
	require.NoError(t, err)
	require.Len(t, crossStable.Groups, 1)
	assert.Equal(t, int64(4000), crossStable.Groups[0].AvgLatencyMs)
	crossPremium, err := Query(QueryParams{Model: "shared", Group: "premium"})
	require.NoError(t, err)
	require.Len(t, crossPremium.Groups, 1)
	assert.Equal(t, int64(2000), crossPremium.Groups[0].AvgLatencyMs)

	// A present rule never falls back just because all of its sources are
	// unknown, and an empty default still permits a specific override.
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"group:stable":["unknown"]}`))
	unknownOnly, err := Query(QueryParams{Model: "shared", Group: "stable"})
	require.NoError(t, err)
	assert.Empty(t, unknownOnly.Groups)
	assert.Nil(t, unknownOnly.Overall)
	require.NoError(t, types.LoadFromJsonString(setting.PerformanceRules, `{"default":[],"group:stable":["stable"]}`))
	emptyDefault, err := Query(QueryParams{Model: "shared"})
	require.NoError(t, err)
	require.Len(t, emptyDefault.Groups, 1)
	assert.Equal(t, "stable", emptyDefault.Groups[0].Group)
	assert.Equal(t, int64(2000), emptyDefault.Groups[0].AvgLatencyMs)

	// Removing free rules restores the legacy mapping. A hidden source without
	// a valid public destination remains fail-closed.
	setting.PerformanceRules.Clear()
	restored, err := Query(QueryParams{Model: "shared"})
	require.NoError(t, err)
	require.Len(t, restored.Groups, 2)
	require.NotNil(t, restored.Overall)
	assert.Equal(t, int64(3111), restored.Overall.AvgLatencyMs)
	restoredSummary, err := QuerySummaryAll(24)
	require.NoError(t, err)
	require.Len(t, restoredSummary.Models, 1)
	assert.Equal(t, int64(9), restoredSummary.Models[0].RequestCount)

	for _, mapping := range []string{`{}`, `{"internal":"deleted"}`} {
		require.NoError(t, types.LoadFromJsonString(setting.PerformanceGroupMapping, mapping))
		failClosed, err := Query(QueryParams{Model: "shared"})
		require.NoError(t, err)
		require.NotNil(t, failClosed.Overall)
		assert.Equal(t, int64(2800), failClosed.Overall.AvgLatencyMs, mapping)
		failClosedSummary, err := QuerySummaryAll(24)
		require.NoError(t, err)
		require.Len(t, failClosedSummary.Models, 1)
		assert.Equal(t, int64(5), failClosedSummary.Models[0].RequestCount, mapping)
		failClosedJSON, err := common.Marshal(failClosed)
		require.NoError(t, err)
		assert.NotContains(t, string(failClosedJSON), "internal", mapping)
	}

	// The display-only settings never rewrite metrics, drain hot buckets, or
	// affect billing ratios.
	var unchanged model.PerfMetric
	require.NoError(t, db.Where(&model.PerfMetric{ModelName: "shared", Group: "internal"}).First(&unchanged).Error)
	assert.Equal(t, int64(3), unchanged.RequestCount)
	hotInternal, ok := hotBuckets.Load(bucketKey{model: "shared", group: "internal", bucketTs: ts})
	require.True(t, ok)
	assert.Equal(t, int64(1), hotInternal.(*atomicBucket).snapshot().requestCount)
	assert.Equal(t, 0.0, ratio_setting.GetGroupRatio("internal"))
}

func TestPerformanceRulesValidation(t *testing.T) {
	for _, value := range []string{
		`{}`,
		`{"default":[],"all":["unknown"],"group:public":["hidden","hidden"]}`,
		`{"group:a":["b"],"group:b":["a"]}`,
	} {
		assert.NoError(t, ratio_setting.CheckPerformanceRules(value), value)
	}
	for _, value := range []string{
		`null`, `[]`, `"rules"`, `{"default":null}`, `{"all":null}`,
		`{"invalid":[]}`, `{"group:":[]}`, `{"group: ":[]}`,
		`{"default":[""]}`, `{"default":["  "]}`, `{"default":"stable"}`,
	} {
		assert.Error(t, ratio_setting.CheckPerformanceRules(value), value)
	}
}

func TestPerformanceFallbacksValidation(t *testing.T) {
	for _, value := range []string{`{}`, `{"default":false,"group:public":true}`, `{"group:unknown":true}`} {
		assert.NoError(t, ratio_setting.CheckPerformanceFallbacks(value), value)
	}
	for _, value := range []string{
		`null`, `[]`, `"fallbacks"`, `{"all":true}`, `{"invalid":true}`,
		`{"group:":true}`, `{"group: ":false}`, `{"default":null}`, `{"default":"true"}`, `{"default":1}`,
	} {
		assert.Error(t, ratio_setting.CheckPerformanceFallbacks(value), value)
	}
}

func TestPerformanceMappingValidation(t *testing.T) {
	for _, value := range []string{`{}`, `{"a":"public","b":"public"}`} {
		assert.NoError(t, ratio_setting.CheckPerformanceGroupMapping(value))
	}
	for _, value := range []string{`null`, `[]`, `{"a":1}`, `{"a":""}`, `{" ":"a"}`, `{"a":"a"}`, `{"a":"b","b":"c"}`, `{"a":"b","b":"a"}`} {
		assert.Error(t, ratio_setting.CheckPerformanceGroupMapping(value), value)
	}
}
