package ratio_setting

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{}

var defaultHiddenGroups = map[string]bool{}

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
	HiddenGroups            *types.RWMap[string, bool]               `json:"hidden_groups"`
	PerformanceGroupMapping *types.RWMap[string, string]             `json:"performance_group_mapping"`
	PerformanceRules        *types.RWMap[string, []string]           `json:"performance_rules"`
	PerformanceFallbacks    *types.RWMap[string, bool]               `json:"performance_fallbacks"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	hiddenGroups := types.NewRWMap[string, bool]()
	hiddenGroups.AddAll(defaultHiddenGroups)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
		HiddenGroups:            hiddenGroups,
		PerformanceGroupMapping: types.NewRWMap[string, string](),
		PerformanceRules:        types.NewRWMap[string, []string](),
		PerformanceFallbacks:    types.NewRWMap[string, bool](),
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	if groupRatioSetting.HiddenGroups == nil {
		groupRatioSetting.HiddenGroups = types.NewRWMap[string, bool]()
		groupRatioSetting.HiddenGroups.AddAll(defaultHiddenGroups)
	}
	if groupRatioSetting.PerformanceGroupMapping == nil {
		groupRatioSetting.PerformanceGroupMapping = types.NewRWMap[string, string]()
	}
	if groupRatioSetting.PerformanceRules == nil {
		groupRatioSetting.PerformanceRules = types.NewRWMap[string, []string]()
	}
	if groupRatioSetting.PerformanceFallbacks == nil {
		groupRatioSetting.PerformanceFallbacks = types.NewRWMap[string, bool]()
	}
	return &groupRatioSetting
}

func PerformanceFallbackEnabled(group string) bool {
	fallbacks := GetGroupRatioSetting().PerformanceFallbacks
	if enabled, ok := fallbacks.Get("group:" + group); ok {
		return enabled
	}
	enabled, _ := fallbacks.Get("default")
	return enabled
}

func GetHiddenGroupsCopy() map[string]bool {
	return GetGroupRatioSetting().HiddenGroups.ReadAll()
}

// GetPerformanceDisplayGroups returns raw group -> public display group.
// Inactive groups are private. Resolve only one hop, and fail closed when a
// target disappears, is hidden, or itself has a mapping. Never rewrite logs.
func GetPerformanceDisplayGroups() map[string]string {
	active := GetGroupRatioCopy()
	active["auto"] = 1
	hidden := GetHiddenGroupsCopy()
	mapping := GetGroupRatioSetting().PerformanceGroupMapping.ReadAll()
	return resolvePerformanceDisplayGroups(active, hidden, mapping)
}

func resolvePerformanceDisplayGroups(active map[string]float64, hidden map[string]bool, mapping map[string]string) map[string]string {
	display := make(map[string]string, len(active))
	for source := range active {
		if target, mapped := mapping[source]; mapped {
			_, exists := active[target]
			_, chained := mapping[target]
			if exists && !hidden[target] && !chained && source != target {
				display[source] = target
			}
			continue
		}
		if !hidden[source] {
			display[source] = source
		}
	}
	return display
}

// ResolvePerformanceMetricSources resolves public display groups to raw metric
// groups. Sources are deliberately not resolved recursively: rules select the
// raw group names stored in performance metrics, including hidden groups.
func ResolvePerformanceMetricSources(requestedGroup string) (map[string][]string, []string, bool) {
	active := GetGroupRatioCopy()
	active["auto"] = 1
	hidden := GetHiddenGroupsCopy()
	setting := GetGroupRatioSetting()
	legacyDisplay := resolvePerformanceDisplayGroups(active, hidden, setting.PerformanceGroupMapping.ReadAll())
	rules := setting.PerformanceRules.ReadAll()

	publicGroups := make(map[string]struct{})
	legacySources := make(map[string][]string)
	for source, display := range legacyDisplay {
		publicGroups[display] = struct{}{}
		legacySources[display] = append(legacySources[display], source)
	}
	if _, hasDefault := rules["default"]; hasDefault {
		for group := range active {
			if !hidden[group] {
				publicGroups[group] = struct{}{}
			}
		}
	}
	for key := range rules {
		name, ok := strings.CutPrefix(key, "group:")
		if !ok || hidden[name] {
			continue
		}
		if _, exists := active[name]; exists {
			publicGroups[name] = struct{}{}
		}
	}

	if requestedGroup != "" {
		if _, ok := publicGroups[requestedGroup]; !ok {
			return map[string][]string{}, nil, false
		}
		sources := resolvePerformanceGroupSources(requestedGroup, active, rules, legacySources)
		return map[string][]string{requestedGroup: sources}, sources, true
	}

	displaySources := make(map[string][]string, len(publicGroups))
	for group := range publicGroups {
		displaySources[group] = resolvePerformanceGroupSources(group, active, rules, legacySources)
	}
	if sources, ok := rules["all"]; ok {
		return displaySources, filterPerformanceSources(sources, active), true
	}
	allSources := make([]string, 0, len(legacyDisplay))
	for source := range legacyDisplay {
		allSources = append(allSources, source)
	}
	return displaySources, filterPerformanceSources(allSources, active), true
}

func resolvePerformanceGroupSources(group string, active map[string]float64, rules map[string][]string, legacy map[string][]string) []string {
	if sources, ok := rules["group:"+group]; ok {
		return filterPerformanceSources(sources, active)
	}
	if sources, ok := rules["default"]; ok {
		return filterPerformanceSources(sources, active)
	}
	return filterPerformanceSources(legacy[group], active)
}

func filterPerformanceSources(sources []string, active map[string]float64) []string {
	filtered := make([]string, 0, len(sources))
	seen := make(map[string]struct{}, len(sources))
	for _, source := range sources {
		if _, exists := active[source]; !exists {
			continue
		}
		if _, duplicate := seen[source]; duplicate {
			continue
		}
		seen[source] = struct{}{}
		filtered = append(filtered, source)
	}
	return filtered
}

func CheckPerformanceGroupMapping(jsonStr string) error {
	var mapping map[string]string
	if err := common.UnmarshalJsonStr(jsonStr, &mapping); err != nil {
		return err
	}
	if mapping == nil {
		return errors.New("performance group mapping must be a JSON object")
	}
	for source, target := range mapping {
		if strings.TrimSpace(source) == "" || strings.TrimSpace(target) == "" {
			return errors.New("performance group names must not be empty")
		}
		if _, chained := mapping[target]; chained {
			return errors.New("performance group mappings must be one-hop: self references, chains and cycles are not allowed")
		}
	}
	return nil
}

func CheckPerformanceRules(jsonStr string) error {
	var rules map[string][]string
	if err := common.UnmarshalJsonStr(jsonStr, &rules); err != nil {
		return err
	}
	if rules == nil {
		return errors.New("performance rules must be a JSON object")
	}
	for key, sources := range rules {
		if key != "default" && key != "all" {
			name, ok := strings.CutPrefix(key, "group:")
			if !ok || strings.TrimSpace(name) == "" {
				return errors.New("performance rule keys must be default, all, or group:<name>")
			}
		}
		if sources == nil {
			return errors.New("performance rule sources must be JSON arrays")
		}
		for _, source := range sources {
			if strings.TrimSpace(source) == "" {
				return errors.New("performance source group names must not be empty")
			}
		}
	}
	return nil
}

func CheckPerformanceFallbacks(jsonStr string) error {
	var fallbacks map[string]*bool
	if err := common.UnmarshalJsonStr(jsonStr, &fallbacks); err != nil {
		return err
	}
	if fallbacks == nil {
		return errors.New("performance fallbacks must be a JSON object")
	}
	for key := range fallbacks {
		if fallbacks[key] == nil {
			return errors.New("performance fallback values must be booleans")
		}
		if key == "default" {
			continue
		}
		name, ok := strings.CutPrefix(key, "group:")
		if !ok || strings.TrimSpace(name) == "" {
			return errors.New("performance fallback keys must be default or group:<name>")
		}
	}
	return nil
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

func GetGroupRatio(name string) float64 {
	ratio, ok := groupRatioMap.Get(name)
	if !ok {
		common.SysLog("group ratio not found: " + name)
		return 1
	}
	return ratio
}

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	gp, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := common.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}

func CheckHiddenGroups(jsonStr string) error {
	hiddenGroups := make(map[string]bool)
	return common.Unmarshal([]byte(jsonStr), &hiddenGroups)
}
