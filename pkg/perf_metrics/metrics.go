package perfmetrics

import (
	"context"
	"fmt"
	"math"
	"slices"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var hotBuckets sync.Map

// seriesSchema is a stable client cache/schema marker. Do not change it when
// hiding fields or making response-only privacy hardening changes.
const seriesSchema = "dbcd0a3c01b55203"

func Init() {
	go flushLoop()
}

func RecordRelaySample(info *relaycommon.RelayInfo, success bool, outputTokens int64) {
	if info == nil {
		return
	}
	now := time.Now()
	hasTtft := info.IsStream && info.HasSendResponse()
	ttftMs := int64(0)
	if hasTtft {
		ttftMs = info.FirstResponseTime.Sub(info.StartTime).Milliseconds()
	}
	latencyMs := now.Sub(info.StartTime).Milliseconds()
	generationMs := latencyMs
	if hasTtft {
		generationMs = now.Sub(info.FirstResponseTime).Milliseconds()
	}
	if generationMs <= 0 {
		generationMs = latencyMs
	}
	Record(Sample{
		Model:        info.OriginModelName,
		Group:        info.UsingGroup,
		LatencyMs:    latencyMs,
		TtftMs:       ttftMs,
		HasTtft:      hasTtft,
		Success:      success,
		OutputTokens: outputTokens,
		GenerationMs: generationMs,
	})
}

func Record(sample Sample) {
	setting := perf_metrics_setting.GetSetting()
	if !setting.Enabled || sample.Model == "" {
		return
	}
	if sample.Group == "" {
		sample.Group = "default"
	}
	if sample.LatencyMs < 0 {
		sample.LatencyMs = 0
	}

	key := bucketKey{
		model:    sample.Model,
		group:    sample.Group,
		bucketTs: bucketStart(time.Now().Unix()),
	}
	actual, _ := hotBuckets.LoadOrStore(key, &atomicBucket{})
	actual.(*atomicBucket).add(sample)
	recordRedis(key, sample)
}

func Query(params QueryParams) (QueryResult, error) {
	if params.Hours <= 0 {
		params.Hours = 24
	}
	if params.Hours > 24*30 {
		params.Hours = 24 * 30
	}
	endTs := time.Now().Unix()
	startTs := endTs - int64(params.Hours)*3600

	displaySources, overallSources, visible := ratio_setting.ResolvePerformanceMetricSources(params.Group)
	if !visible {
		return buildQueryResult(params.Model, map[bucketKey]counters{}, map[int64]counters{}), nil
	}
	enabledGroups := model.GetModelEnableGroups(params.Model)
	for display := range displaySources {
		if !modelEnabledInGroup(enabledGroups, display) {
			delete(displaySources, display)
		}
	}
	if params.Group != "" && len(displaySources) == 0 {
		return buildQueryResult(params.Model, map[bucketKey]counters{}, map[int64]counters{}), nil
	}
	overallSourceSet := allowedGroupSet(overallSources)
	rawBuckets := map[bucketKey]counters{}
	overallBuckets := map[int64]counters{}
	// Query raw groups before applying display rules so DB and hot samples use
	// the exact same source selection.
	rows, err := model.GetPerfMetrics(params.Model, "", startTs, endTs)
	if err != nil {
		return QueryResult{}, err
	}
	for _, row := range rows {
		value := counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
		}
		mergeCounters(rawBuckets, bucketKey{model: row.ModelName, group: row.Group, bucketTs: row.BucketTs}, value)
		mergeOverallBucket(overallBuckets, overallSourceSet, row.Group, row.BucketTs, value)
	}

	hotBuckets.Range(func(key, value any) bool {
		k := key.(bucketKey)
		if k.model != params.Model || k.bucketTs < startTs || k.bucketTs > endTs {
			return true
		}
		snapshot := value.(*atomicBucket).snapshot()
		mergeCounters(rawBuckets, k, snapshot)
		mergeOverallBucket(overallBuckets, overallSourceSet, k.group, k.bucketTs, snapshot)
		return true
	})

	merged := selectDisplayBuckets(params.Model, displaySources, rawBuckets)
	if params.Group != "" {
		overallBuckets = map[int64]counters{}
		for key, value := range merged {
			current := overallBuckets[key.bucketTs]
			current.requestCount += value.requestCount
			current.successCount += value.successCount
			current.totalLatencyMs += value.totalLatencyMs
			current.ttftSumMs += value.ttftSumMs
			current.ttftCount += value.ttftCount
			current.outputTokens += value.outputTokens
			current.generationMs += value.generationMs
			overallBuckets[key.bucketTs] = current
		}
	}
	return buildQueryResult(params.Model, merged, overallBuckets), nil
}

func QuerySummaryAll(hours int, requestedGroup ...string) (SummaryAllResult, error) {
	if hours <= 0 {
		hours = 24
	}
	if hours > 24*30 {
		hours = 24 * 30
	}
	endTs := time.Now().Unix()
	startTs := endTs - int64(hours)*3600
	group := ""
	if len(requestedGroup) > 0 {
		group = requestedGroup[0]
	}
	displaySources, groups, visible := ratio_setting.ResolvePerformanceMetricSources(group)
	if !visible {
		return SummaryAllResult{Models: []ModelSummary{}}, nil
	}
	queryGroups := groups
	if group != "" && len(groups) > 0 && ratio_setting.PerformanceFallbackEnabled(group) && !slices.Contains(queryGroups, group) {
		queryGroups = append(slices.Clone(queryGroups), group)
	}
	allowedGroups := allowedGroupSet(queryGroups)

	rows, err := model.GetPerfMetricsSummaryBucketsAll(startTs, endTs, queryGroups)
	if err != nil {
		return SummaryAllResult{}, err
	}

	rawByModel := map[string]map[bucketKey]counters{}
	for _, row := range rows {
		value := counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
		}
		if rawByModel[row.ModelName] == nil {
			rawByModel[row.ModelName] = map[bucketKey]counters{}
		}
		mergeCounters(rawByModel[row.ModelName], bucketKey{model: row.ModelName, group: row.Group, bucketTs: row.BucketTs}, value)
	}

	hotBuckets.Range(func(key, value any) bool {
		k := key.(bucketKey)
		if k.bucketTs < startTs || k.bucketTs > endTs {
			return true
		}
		if _, ok := allowedGroups[k.group]; !ok {
			return true
		}
		snap := value.(*atomicBucket).snapshot()
		if rawByModel[k.model] == nil {
			rawByModel[k.model] = map[bucketKey]counters{}
		}
		mergeCounters(rawByModel[k.model], k, snap)
		return true
	})

	totals := map[string]counters{}
	modelBuckets := map[string]map[int64]counters{}
	if group == "" {
		for _, rawBuckets := range rawByModel {
			for key, value := range rawBuckets {
				mergeModelTotals(totals, key.model, value)
				mergeModelBucket(modelBuckets, key.model, key.bucketTs, value)
			}
		}
	} else {
		for _, pricing := range model.GetPricing() {
			if !modelEnabledInGroup(pricing.EnableGroup, group) {
				continue
			}
			selected := selectDisplayBuckets(pricing.ModelName, displaySources, rawByModel[pricing.ModelName])
			for key, value := range selected {
				mergeModelTotals(totals, key.model, value)
				mergeModelBucket(modelBuckets, key.model, key.bucketTs, value)
			}
		}
	}

	models := make([]ModelSummary, 0, len(totals))
	for name, total := range totals {
		if total.requestCount == 0 {
			continue
		}
		avgLatency := total.totalLatencyMs / total.requestCount
		successRate := float64(total.successCount) / float64(total.requestCount) * 100
		avgTps := 0.0
		if total.generationMs > 0 {
			avgTps = float64(total.outputTokens) / (float64(total.generationMs) / 1000.0)
		}
		models = append(models, ModelSummary{
			ModelName:           name,
			AvgLatencyMs:        avgLatency,
			SuccessRate:         math.Round(successRate*100) / 100,
			AvgTps:              math.Round(avgTps*100) / 100,
			RecentSuccessSeries: recentSuccessSeries(modelBuckets[name]),
			RequestCount:        total.requestCount,
		})
	}
	sort.Slice(models, func(i, j int) bool {
		return models[i].RequestCount > models[j].RequestCount
	})

	return SummaryAllResult{Models: models}, nil
}

func mergeModelTotals(totals map[string]counters, modelName string, value counters) {
	if value.requestCount == 0 {
		return
	}
	current := totals[modelName]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	totals[modelName] = current
}

func mergeModelBucket(modelBuckets map[string]map[int64]counters, modelName string, bucketTs int64, value counters) {
	if value.requestCount == 0 {
		return
	}
	if _, ok := modelBuckets[modelName]; !ok {
		modelBuckets[modelName] = map[int64]counters{}
	}
	current := modelBuckets[modelName][bucketTs]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	modelBuckets[modelName][bucketTs] = current
}

func recentSuccessSeries(buckets map[int64]counters) []SuccessRatePoint {
	if len(buckets) == 0 {
		return nil
	}
	hourly := map[int64]counters{}
	for ts, value := range buckets {
		hourTs := ts - ts%3600
		merged := hourly[hourTs]
		merged.requestCount += value.requestCount
		merged.successCount += value.successCount
		hourly[hourTs] = merged
	}
	timestamps := make([]int64, 0, len(hourly))
	for hourTs, value := range hourly {
		if value.requestCount == 0 {
			continue
		}
		timestamps = append(timestamps, hourTs)
	}
	if len(timestamps) == 0 {
		return nil
	}
	slices.Sort(timestamps)
	points := make([]SuccessRatePoint, 0, len(timestamps))
	for _, hourTs := range timestamps {
		points = append(points, SuccessRatePoint{
			Ts:          hourTs,
			SuccessRate: math.Round(successRate(hourly[hourTs])*100) / 100,
		})
	}
	return points
}

func allowedGroupSet(groups []string) map[string]struct{} {
	if groups == nil {
		return nil
	}
	allowed := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		allowed[group] = struct{}{}
	}
	return allowed
}

func bucketStart(ts int64) int64 {
	bucketSeconds := perf_metrics_setting.GetBucketSeconds()
	if bucketSeconds <= 0 {
		bucketSeconds = 3600
	}
	return ts - (ts % bucketSeconds)
}

func mergeCounters(merged map[bucketKey]counters, key bucketKey, value counters) {
	if value.requestCount == 0 {
		return
	}
	current := merged[key]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	merged[key] = current
}

func mergeOverallBucket(
	overallBuckets map[int64]counters,
	overallSources map[string]struct{},
	source string,
	bucketTs int64,
	value counters,
) {
	if value.requestCount == 0 {
		return
	}
	if _, ok := overallSources[source]; ok {
		current := overallBuckets[bucketTs]
		current.requestCount += value.requestCount
		current.successCount += value.successCount
		current.totalLatencyMs += value.totalLatencyMs
		current.ttftSumMs += value.ttftSumMs
		current.ttftCount += value.ttftCount
		current.outputTokens += value.outputTokens
		current.generationMs += value.generationMs
		overallBuckets[bucketTs] = current
	}
}

func modelEnabledInGroup(groups []string, group string) bool {
	return slices.Contains(groups, "all") || slices.Contains(groups, group)
}

// selectDisplayBuckets chooses sources for the complete query window. This
// keeps persisted and hot samples on the same side of the fallback decision.
func selectDisplayBuckets(modelName string, displaySources map[string][]string, raw map[bucketKey]counters) map[bucketKey]counters {
	selected := make(map[bucketKey]counters)
	for display, sources := range displaySources {
		if len(sources) == 0 {
			continue
		}
		hasSamples := false
		for key, value := range raw {
			if key.model == modelName && slices.Contains(sources, key.group) && value.requestCount > 0 {
				hasSamples = true
				break
			}
		}
		selectedSources := sources
		if !hasSamples && ratio_setting.PerformanceFallbackEnabled(display) {
			selectedSources = []string{display}
		}
		for key, value := range raw {
			if key.model != modelName || !slices.Contains(selectedSources, key.group) {
				continue
			}
			mergeCounters(selected, bucketKey{model: modelName, group: display, bucketTs: key.bucketTs}, value)
		}
	}
	return selected
}

func buildQueryResult(modelName string, merged map[bucketKey]counters, overallBuckets map[int64]counters) QueryResult {
	groupBuckets := map[string]map[int64]counters{}
	for key, value := range merged {
		if value.requestCount == 0 {
			continue
		}
		if _, ok := groupBuckets[key.group]; !ok {
			groupBuckets[key.group] = map[int64]counters{}
		}
		groupBuckets[key.group][key.bucketTs] = value
	}

	groups := make([]string, 0, len(groupBuckets))
	for group := range groupBuckets {
		groups = append(groups, group)
	}
	slices.Sort(groups)

	results := make([]GroupResult, 0, len(groups))
	for _, group := range groups {
		results = append(results, buildGroupResult(group, groupBuckets[group]))
	}
	var overall *GroupResult
	if len(overallBuckets) > 0 {
		combined := buildGroupResult("", overallBuckets)
		overall = &combined
	}

	return QueryResult{
		ModelName:    modelName,
		SeriesSchema: seriesSchema,
		Groups:       results,
		Overall:      overall,
	}
}

func buildGroupResult(group string, buckets map[int64]counters) GroupResult {
	timestamps := make([]int64, 0, len(buckets))
	for ts := range buckets {
		timestamps = append(timestamps, ts)
	}
	slices.Sort(timestamps)
	total := counters{}
	series := make([]BucketPoint, 0, len(timestamps))
	for _, ts := range timestamps {
		value := buckets[ts]
		total.requestCount += value.requestCount
		total.successCount += value.successCount
		total.totalLatencyMs += value.totalLatencyMs
		total.ttftSumMs += value.ttftSumMs
		total.ttftCount += value.ttftCount
		total.outputTokens += value.outputTokens
		total.generationMs += value.generationMs
		series = append(series, bucketPoint(ts, value))
	}
	return GroupResult{
		Group: group, AvgTtftMs: avg(total.ttftSumMs, total.ttftCount),
		AvgLatencyMs: avg(total.totalLatencyMs, total.requestCount),
		SuccessRate:  successRate(total), AvgTps: avgTps(total), Series: series,
	}
}

func bucketPoint(ts int64, value counters) BucketPoint {
	return BucketPoint{
		Ts:           ts,
		AvgTtftMs:    avg(value.ttftSumMs, value.ttftCount),
		AvgLatencyMs: avg(value.totalLatencyMs, value.requestCount),
		SuccessRate:  successRate(value),
		AvgTps:       avgTps(value),
	}
}

func avg(sum int64, count int64) int64 {
	if count <= 0 {
		return 0
	}
	return sum / count
}

func successRate(value counters) float64 {
	if value.requestCount <= 0 {
		return 0
	}
	return float64(value.successCount) / float64(value.requestCount) * 100
}

func avgTps(value counters) float64 {
	if value.outputTokens <= 0 || value.generationMs <= 0 {
		return 0
	}
	return float64(value.outputTokens) / (float64(value.generationMs) / 1000)
}

func recordRedis(key bucketKey, sample Sample) {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	redisKey := redisBucketKey(key)
	pipe := common.RDB.TxPipeline()
	pipe.HIncrBy(ctx, redisKey, "req", 1)
	if sample.Success {
		pipe.HIncrBy(ctx, redisKey, "ok", 1)
	}
	if sample.LatencyMs > 0 {
		pipe.HIncrBy(ctx, redisKey, "lat", sample.LatencyMs)
	}
	if sample.HasTtft && sample.TtftMs >= 0 {
		pipe.HIncrBy(ctx, redisKey, "ttft", sample.TtftMs)
		pipe.HIncrBy(ctx, redisKey, "ttft_n", 1)
	}
	if sample.OutputTokens > 0 && sample.GenerationMs > 0 {
		pipe.HIncrBy(ctx, redisKey, "out", sample.OutputTokens)
		pipe.HIncrBy(ctx, redisKey, "gen_ms", sample.GenerationMs)
	}
	pipe.Expire(ctx, redisKey, time.Hour)
	_, _ = pipe.Exec(ctx)
}

func mergeRedisActiveBuckets(merged map[bucketKey]counters, params QueryParams, startTs int64, endTs int64) {
	if !common.RedisEnabled || common.RDB == nil || params.Model == "" || params.Group == "" {
		return
	}
	active := bucketStart(time.Now().Unix())
	if active < startTs || active > endTs {
		return
	}
	key := bucketKey{model: params.Model, group: params.Group, bucketTs: active}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	values, err := common.RDB.HGetAll(ctx, redisBucketKey(key)).Result()
	if err != nil || len(values) == 0 {
		return
	}
	mergeCounters(merged, key, redisCounters(values))
}

func redisBucketKey(key bucketKey) string {
	return fmt.Sprintf("perf:%s:%s:%d", key.model, key.group, key.bucketTs)
}
