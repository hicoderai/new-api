package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetPricingHidesConfiguredGroupsOnlyFromMarketplace(t *testing.T) {
	originalRatios := ratio_setting.GroupRatio2JSONString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalAutoGroups := setting.AutoGroups2JsonString()
	hiddenGroups := ratio_setting.GetGroupRatioSetting().HiddenGroups
	originalHiddenGroups := hiddenGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		hiddenGroups.Clear()
		hiddenGroups.AddAll(originalHiddenGroups)
		model.InvalidatePricingCache()
	})

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"internal":0}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","internal":"Internal"}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["internal","default"]`))
	hiddenGroups.Clear()
	hiddenGroups.Set("internal", true)

	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "zz-public-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-shared-model", ChannelId: 1, Enabled: true},
		{Group: "internal", Model: "zz-shared-model", ChannelId: 2, Enabled: true},
		{Group: "internal", Model: "zz-internal-only-model", ChannelId: 1, Enabled: true},
	}).Error)
	model.InvalidatePricingCache()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/pricing", nil)

	GetPricing(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success     bool               `json:"success"`
		Data        []model.Pricing    `json:"data"`
		GroupRatio  map[string]float64 `json:"group_ratio"`
		UsableGroup map[string]string  `json:"usable_group"`
		AutoGroups  []string           `json:"auto_groups"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)

	marketplacePricing := pricingByModelName(payload.Data)
	require.Contains(t, marketplacePricing, "zz-public-model")
	require.Contains(t, marketplacePricing, "zz-shared-model")
	assert.Equal(t, []string{"default"}, marketplacePricing["zz-shared-model"].EnableGroup)
	assert.NotContains(t, marketplacePricing, "zz-internal-only-model")
	assert.NotContains(t, payload.GroupRatio, "internal")
	assert.NotContains(t, payload.UsableGroup, "internal")
	assert.Equal(t, []string{"default"}, payload.AutoGroups)

	assert.Contains(t, service.GetUserUsableGroups(""), "internal")
	assert.Contains(t, service.GetUserAutoGroup(""), "internal")
	internalPricing := pricingByModelName(model.GetPricing())
	assert.ElementsMatch(t, []string{"default", "internal"}, internalPricing["zz-shared-model"].EnableGroup)
	assert.Contains(t, internalPricing, "zz-internal-only-model")
}
