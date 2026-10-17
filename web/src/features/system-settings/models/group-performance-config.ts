/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

type GroupPerformanceConfig = {
  GroupRatio: string
  HiddenGroups: string
  PerformanceGroupMapping: string
  PerformanceRules: string
  PerformanceFallbacks: string
  AutoGroups: string
}

// Called only after the settings form has validated the JSON fields. Keep the
// legacy mapping for compatibility (including fail-closed invalid targets),
// but materialize its effective merges as source rules before saving.
export function normalizeGroupPerformanceConfig(
  values: GroupPerformanceConfig
) {
  const ratios = JSON.parse(values.GroupRatio) as Record<string, number>
  const active = new Set([...Object.keys(ratios), 'auto'])
  const hidden = JSON.parse(values.HiddenGroups) as Record<string, boolean>
  const mapping = JSON.parse(values.PerformanceGroupMapping) as Record<
    string,
    string
  >
  const rules = JSON.parse(values.PerformanceRules) as Record<string, string[]>
  const fallbacks = JSON.parse(values.PerformanceFallbacks) as Record<
    string,
    boolean
  >
  const autoGroups = JSON.parse(values.AutoGroups) as string[]
  const nextRules: Record<string, string[]> = {}
  const nextFallbacks: Record<string, boolean> = {}

  for (const [scope, sources] of Object.entries(rules)) {
    if (scope.startsWith('group:') && !active.has(scope.slice(6))) continue
    // Preserve explicit []: deleting the last source must not inherit other
    // groups' samples or enable a fallback that was intentionally unavailable.
    nextRules[scope] = [
      ...new Set(sources.filter((source) => active.has(source))),
    ]
  }
  for (const [scope, enabled] of Object.entries(fallbacks)) {
    if (scope === 'default' || active.has(scope.slice(6))) {
      nextFallbacks[scope] = enabled
    }
  }

  if (!Object.hasOwn(nextRules, 'default')) {
    const mergedSources = new Map<string, string[]>()
    for (const source of active) {
      const target = mapping[source]
      if (target === undefined) continue
      if (
        source === target ||
        !active.has(target) ||
        hidden[target] ||
        Object.hasOwn(mapping, target)
      ) {
        continue
      }
      mergedSources.set(target, [...(mergedSources.get(target) ?? []), source])
    }
    for (const [target, sources] of mergedSources) {
      const scope = `group:${target}`
      if (Object.hasOwn(nextRules, scope)) continue
      nextRules[scope] = [target, ...sources]
    }
  }

  return {
    PerformanceRules: JSON.stringify(nextRules, null, 2),
    PerformanceFallbacks: JSON.stringify(nextFallbacks, null, 2),
    AutoGroups: JSON.stringify(
      autoGroups.filter((group) => Object.hasOwn(ratios, group)),
      null,
      2
    ),
  }
}
