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
import {
  AlertTriangle,
  ChevronDown,
  GripVertical,
  Info,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState, useMemo, useCallback, memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { safeJsonParse } from '../utils/json-parser'

type GroupRatioVisualEditorProps = {
  groupRatio: string
  topupGroupRatio: string
  userUsableGroups: string
  groupGroupRatio: string
  autoGroups: string
  maxTokenAutoGroupsField: ReactNode
  groupSpecialUsableGroup: string
  hiddenGroups: string
  performanceGroupMapping?: string
  performanceRules?: string
  performanceFallbacks?: string
  onChange: (field: string, value: string) => void
}

type GroupPricingRow = {
  _id: string
  _lastName: string
  name: string
  ratio: string
  topupRatio: string
  selectable: boolean
  hidden: boolean
  performanceGroup: string
  description: string
}

type RegistryEntry = {
  name: string
  ratio: number
}

const sectionCardClassName =
  'relative shadow-sm ring-0 before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:border before:border-border/90'
const sectionHeaderClassName = 'border-b bg-muted/20'

let groupPricingIdCounter = 0
function createGroupPricingId() {
  groupPricingIdCounter += 1
  return `gpr_${groupPricingIdCounter}`
}

function normalizeRatio(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 1
}

function parseRatioMap(value: string): Record<string, number> {
  return safeJsonParse<Record<string, number>>(value, {
    fallback: {},
    silent: true,
  })
}

function parseUsableMap(value: string): Record<string, string> {
  return safeJsonParse<Record<string, string>>(value, {
    fallback: {},
    silent: true,
  })
}

function parseHiddenMap(value: string): Record<string, boolean> {
  return safeJsonParse<Record<string, boolean>>(value, {
    fallback: {},
    silent: true,
  })
}

function parsePerformanceRules(value: string): Record<string, string[]> {
  const parsed = safeJsonParse<unknown>(value, {
    fallback: {},
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const rules: Record<string, string[]> = {}
  for (const [scope, sources] of Object.entries(parsed)) {
    if (!Array.isArray(sources)) continue
    rules[scope] = [
      ...new Set(
        sources.filter(
          (source): source is string =>
            typeof source === 'string' && source.trim() !== ''
        )
      ),
    ]
  }
  return rules
}

function parsePerformanceFallbacks(value: string): Record<string, boolean> {
  const parsed = safeJsonParse<unknown>(value, {
    fallback: {},
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
    )
  )
}

function renamePerformanceGroup(
  value: string,
  previousName: string,
  nextName: string
): string {
  const current = parsePerformanceRules(value)
  const next: Record<string, string[]> = {}
  for (const [scope, sources] of Object.entries(current)) {
    const nextScope =
      scope === `group:${previousName}` ? `group:${nextName}` : scope
    next[nextScope] = [
      ...new Set(
        sources.map((source) => (source === previousName ? nextName : source))
      ),
    ]
  }
  return JSON.stringify(next, null, 2)
}

function renamePerformanceFallback(
  value: string,
  previousName: string,
  nextName?: string
): string {
  const current = parsePerformanceFallbacks(value)
  const previousScope = `group:${previousName}`
  if (!Object.hasOwn(current, previousScope)) return value
  const next = { ...current }
  const enabled = next[previousScope]
  delete next[previousScope]
  if (nextName) next[`group:${nextName}`] = enabled
  return JSON.stringify(next, null, 2)
}

function parseNestedRatioMap(
  value: string
): Record<string, Record<string, number>> {
  return safeJsonParse<Record<string, Record<string, number>>>(value, {
    fallback: {},
    silent: true,
  })
}

function buildGroupPricingRows(
  groupRatio: string,
  userUsableGroups: string,
  topupGroupRatio: string,
  hiddenGroups: string,
  performanceGroupMapping: string
): GroupPricingRow[] {
  const ratioMap = parseRatioMap(groupRatio)
  const usableMap = parseUsableMap(userUsableGroups)
  const topupMap = parseRatioMap(topupGroupRatio)
  const hiddenMap = parseHiddenMap(hiddenGroups)
  const performanceMap = parseUsableMap(performanceGroupMapping)
  const names = new Set([
    ...Object.keys(ratioMap),
    ...Object.keys(usableMap),
    ...Object.keys(topupMap),
  ])

  return [...names].map((name) => ({
    _id: createGroupPricingId(),
    _lastName: name,
    name,
    ratio: String(normalizeRatio(ratioMap[name])),
    topupRatio: Object.hasOwn(topupMap, name) ? String(topupMap[name]) : '',
    selectable: Object.hasOwn(usableMap, name),
    hidden: hiddenMap[name] === true,
    performanceGroup: performanceMap[name] ?? '',
    description: String(usableMap[name] ?? ''),
  }))
}

function serializeGroupPricingRows(rows: GroupPricingRow[]) {
  const groupRatio: Record<string, number> = {}
  const userUsableGroups: Record<string, string> = {}
  const topupGroupRatio: Record<string, number> = {}
  const hiddenGroups: Record<string, boolean> = {}
  const performanceGroupMapping: Record<string, string> = {}

  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    groupRatio[name] = normalizeRatio(row.ratio)
    if (row.selectable) {
      userUsableGroups[name] = row.description
    }
    if (row.hidden) {
      hiddenGroups[name] = true
    }
    if (row.performanceGroup) {
      performanceGroupMapping[name] = row.performanceGroup
    }
    const topup = row.topupRatio.trim()
    if (topup !== '' && Number.isFinite(Number(topup))) {
      topupGroupRatio[name] = Number(topup)
    }
  }

  return {
    GroupRatio: JSON.stringify(groupRatio, null, 2),
    UserUsableGroups: JSON.stringify(userUsableGroups, null, 2),
    TopupGroupRatio: JSON.stringify(topupGroupRatio, null, 2),
    HiddenGroups: JSON.stringify(hiddenGroups, null, 2),
    PerformanceGroupMapping: JSON.stringify(performanceGroupMapping, null, 2),
  }
}

function groupPricingSignature(rows: GroupPricingRow[]): string {
  const serialized = serializeGroupPricingRows(rows)
  return JSON.stringify({
    groupRatio: parseRatioMap(serialized.GroupRatio),
    userUsableGroups: parseUsableMap(serialized.UserUsableGroups),
    topupGroupRatio: parseRatioMap(serialized.TopupGroupRatio),
    hiddenGroups: parseHiddenMap(serialized.HiddenGroups),
    performanceGroupMapping: parseUsableMap(serialized.PerformanceGroupMapping),
  })
}

function sourceGroupPricingSignature(
  groupRatio: string,
  userUsableGroups: string,
  topupGroupRatio: string,
  hiddenGroups: string,
  performanceGroupMapping: string
): string {
  return JSON.stringify({
    groupRatio: parseRatioMap(groupRatio),
    userUsableGroups: parseUsableMap(userUsableGroups),
    topupGroupRatio: parseRatioMap(topupGroupRatio),
    hiddenGroups: parseHiddenMap(hiddenGroups),
    performanceGroupMapping: parseUsableMap(performanceGroupMapping),
  })
}

function UnknownGroupBadge() {
  const { t } = useTranslation()
  return (
    <StatusBadge variant='danger' copyable={false}>
      <AlertTriangle className='mr-1 h-3 w-3' />
      {t('Not in pricing table')}
    </StatusBadge>
  )
}

type GroupNameSelectProps = {
  options: string[]
  value: string | null
  placeholder: string
  onValueChange: (value: string) => void
  className?: string
}

function GroupNameSelect(props: GroupNameSelectProps) {
  const options = useMemo(() => {
    if (props.value && !props.options.includes(props.value)) {
      return [props.value, ...props.options]
    }
    return props.options
  }, [props.options, props.value])

  return (
    <Combobox
      options={options.map((name) => ({ value: name, label: name }))}
      value={props.value}
      onValueChange={(value) => {
        if (value) props.onValueChange(value)
      }}
      className={props.className ?? 'w-48'}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
    />
  )
}

export const GroupRatioVisualEditor = memo(function GroupRatioVisualEditor({
  groupRatio,
  topupGroupRatio,
  userUsableGroups,
  groupGroupRatio,
  autoGroups,
  maxTokenAutoGroupsField,
  groupSpecialUsableGroup,
  hiddenGroups,
  performanceGroupMapping = '{}',
  performanceRules = '{}',
  performanceFallbacks = '{}',
  onChange,
}: GroupRatioVisualEditorProps) {
  const { t } = useTranslation()
  const [detailGroup, setDetailGroup] = useState<string | null>(null)

  const registry = useMemo<RegistryEntry[]>(() => {
    const ratioMap = parseRatioMap(groupRatio)
    const usableMap = parseUsableMap(userUsableGroups)
    const topupMap = parseRatioMap(topupGroupRatio)
    const names = new Set([
      ...Object.keys(ratioMap),
      ...Object.keys(usableMap),
      ...Object.keys(topupMap),
    ])
    return [...names].map((name) => ({
      name,
      ratio: normalizeRatio(ratioMap[name]),
    }))
  }, [groupRatio, userUsableGroups, topupGroupRatio])

  const registryNames = useMemo(
    () => registry.map((entry) => entry.name),
    [registry]
  )

  // Auto groups
  const autoGroupsList = useMemo(() => {
    return safeJsonParse<string[]>(autoGroups, {
      fallback: [],
      context: 'auto groups',
    })
  }, [autoGroups])

  const handleAutoGroupAdd = useCallback(
    (name: string) => {
      if (autoGroupsList.includes(name)) return
      onChange('AutoGroups', JSON.stringify([...autoGroupsList, name], null, 2))
    },
    [autoGroupsList, onChange]
  )

  const handleAutoGroupDelete = useCallback(
    (index: number) => {
      const list = autoGroupsList.filter((_, i) => i !== index)
      onChange('AutoGroups', JSON.stringify(list, null, 2))
    },
    [autoGroupsList, onChange]
  )

  const handleAutoGroupMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const list = [...autoGroupsList]
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= list.length) return
      ;[list[index], list[newIndex]] = [list[newIndex], list[index]]
      onChange('AutoGroups', JSON.stringify(list, null, 2))
    },
    [autoGroupsList, onChange]
  )

  const autoGroupCandidates = useMemo(
    () => registryNames.filter((name) => !autoGroupsList.includes(name)),
    [registryNames, autoGroupsList]
  )

  return (
    <div className='space-y-4'>
      <GroupPricingTable
        groupRatio={groupRatio}
        userUsableGroups={userUsableGroups}
        topupGroupRatio={topupGroupRatio}
        hiddenGroups={hiddenGroups}
        performanceGroupMapping={performanceGroupMapping}
        performanceRules={performanceRules}
        performanceFallbacks={performanceFallbacks}
        onChange={onChange}
        onShowDetail={setDetailGroup}
      />

      <PerformanceRulesEditor
        groupRatio={groupRatio}
        hiddenGroups={hiddenGroups}
        performanceGroupMapping={performanceGroupMapping}
        value={performanceRules}
        onChange={(value) => onChange('PerformanceRules', value)}
        fallbackValue={performanceFallbacks}
        onFallbackChange={(value) => onChange('PerformanceFallbacks', value)}
      />

      <GroupOverrideRules
        registry={registry}
        groupGroupRatio={groupGroupRatio}
        onChange={onChange}
      />

      {/* Auto Groups */}
      <Card className={sectionCardClassName}>
        <CardHeader className={sectionHeaderClassName}>
          <CardTitle>{t('Auto assignment order')}</CardTitle>
          <CardDescription>
            {t(
              'Priority order for tokens in the auto group. The system tries groups from top to bottom.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {maxTokenAutoGroupsField}
            <GroupNameSelect
              options={autoGroupCandidates}
              value={null}
              placeholder={t('Add group')}
              onValueChange={handleAutoGroupAdd}
            />
            {autoGroupsList.length > 0 && (
              <div className='space-y-2'>
                {autoGroupsList.map((group, index) => (
                  <div
                    key={group}
                    className='flex items-center gap-2 rounded-md border p-3'
                  >
                    <GripVertical className='text-muted-foreground h-4 w-4' />
                    <span className='font-medium'>{group}</span>
                    {!registryNames.includes(group) && <UnknownGroupBadge />}
                    <div className='ml-auto flex gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={index === 0}
                        onClick={() => handleAutoGroupMove(index, 'up')}
                      >
                        ↑
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={index === autoGroupsList.length - 1}
                        onClick={() => handleAutoGroupMove(index, 'down')}
                      >
                        ↓
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => handleAutoGroupDelete(index)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <GroupDetailSheet
        groupName={detailGroup}
        onOpenChange={(open) => {
          if (!open) setDetailGroup(null)
        }}
        registry={registry}
        topupGroupRatio={topupGroupRatio}
        userUsableGroups={userUsableGroups}
        groupGroupRatio={groupGroupRatio}
        autoGroups={autoGroupsList}
        groupSpecialUsableGroup={groupSpecialUsableGroup}
      />
    </div>
  )
})

type GroupPricingTableProps = {
  groupRatio: string
  userUsableGroups: string
  topupGroupRatio: string
  hiddenGroups: string
  performanceGroupMapping: string
  performanceRules: string
  performanceFallbacks: string
  onChange: (field: string, value: string) => void
  onShowDetail: (name: string) => void
}

function GroupPricingTable({
  groupRatio,
  userUsableGroups,
  topupGroupRatio,
  hiddenGroups,
  performanceGroupMapping,
  performanceRules,
  performanceFallbacks,
  onChange,
  onShowDetail,
}: GroupPricingTableProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<GroupPricingRow[]>(() =>
    buildGroupPricingRows(
      groupRatio,
      userUsableGroups,
      topupGroupRatio,
      hiddenGroups,
      performanceGroupMapping
    )
  )

  const sourceKey = JSON.stringify([
    groupRatio,
    userUsableGroups,
    topupGroupRatio,
    hiddenGroups,
    performanceGroupMapping,
  ])
  const [previousSourceKey, setPreviousSourceKey] = useState(sourceKey)
  if (sourceKey !== previousSourceKey) {
    setPreviousSourceKey(sourceKey)
    const incomingSignature = sourceGroupPricingSignature(
      groupRatio,
      userUsableGroups,
      topupGroupRatio,
      hiddenGroups,
      performanceGroupMapping
    )
    setRows((currentRows) => {
      if (groupPricingSignature(currentRows) === incomingSignature) {
        return currentRows
      }
      return buildGroupPricingRows(
        groupRatio,
        userUsableGroups,
        topupGroupRatio,
        hiddenGroups,
        performanceGroupMapping
      )
    })
  }

  const emitRows = useCallback(
    (nextRows: GroupPricingRow[]) => {
      setRows(nextRows)
      const serialized = serializeGroupPricingRows(nextRows)
      onChange('GroupRatio', serialized.GroupRatio)
      onChange('UserUsableGroups', serialized.UserUsableGroups)
      onChange('TopupGroupRatio', serialized.TopupGroupRatio)
      onChange('HiddenGroups', serialized.HiddenGroups)
      onChange('PerformanceGroupMapping', serialized.PerformanceGroupMapping)
    },
    [onChange]
  )

  const updateRow = useCallback(
    (
      id: string,
      field: Exclude<keyof GroupPricingRow, '_id' | '_lastName'>,
      value: string | number | boolean
    ) => {
      const previousName = rows.find((row) => row._id === id)?._lastName
      const nextName = String(value).trim()
      emitRows(
        rows.map((row) => {
          const updated = row._id === id ? { ...row, [field]: value } : row
          if (field === 'name' && row._id === id && nextName) {
            updated._lastName = nextName
          }
          if (
            field === 'name' &&
            nextName &&
            previousName &&
            row.performanceGroup === previousName
          ) {
            return { ...updated, performanceGroup: nextName }
          }
          return updated
        })
      )
      if (
        field === 'name' &&
        previousName &&
        nextName &&
        previousName !== nextName
      ) {
        onChange(
          'PerformanceRules',
          renamePerformanceGroup(performanceRules, previousName, nextName)
        )
        onChange(
          'PerformanceFallbacks',
          renamePerformanceFallback(
            performanceFallbacks,
            previousName,
            nextName
          )
        )
      }
    },
    [emitRows, onChange, performanceFallbacks, performanceRules, rows]
  )

  const addRow = useCallback(() => {
    const existingNames = new Set(rows.map((row) => row.name))
    let index = 1
    let name = `group_${index}`
    while (existingNames.has(name)) {
      index += 1
      name = `group_${index}`
    }
    emitRows([
      ...rows,
      {
        _id: createGroupPricingId(),
        _lastName: name,
        name,
        ratio: '1',
        topupRatio: '',
        selectable: true,
        hidden: false,
        performanceGroup: '',
        description: '',
      },
    ])
  }, [emitRows, rows])

  const removeRow = useCallback(
    (id: string) => {
      const removedName = rows.find((row) => row._id === id)?.name.trim()
      emitRows(rows.filter((row) => row._id !== id))
      if (removedName) {
        onChange(
          'PerformanceFallbacks',
          renamePerformanceFallback(performanceFallbacks, removedName)
        )
      }
    },
    [emitRows, onChange, performanceFallbacks, rows]
  )

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const name = row.name.trim()
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  }, [rows])

  return (
    <Card className={sectionCardClassName}>
      <CardHeader className={sectionHeaderClassName}>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{t('Pricing groups')}</CardTitle>
            <CardDescription>
              {t(
                'All group names live here. Ratio applies when calls are billed as this group; top-up ratio applies to users whose account is in this group.'
              )}
            </CardDescription>
          </div>
          <Button onClick={addRow} size='sm' className='sm:self-start'>
            <Plus className='mr-2 h-4 w-4' />
            {t('Add group')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          <StaticDataTable
            tableClassName='min-w-[76rem]'
            data={rows}
            getRowKey={(row) => row._id}
            emptyClassName='text-muted-foreground h-20 text-sm'
            emptyContent={t('No groups yet. Add a group to get started.')}
            columns={[
              {
                id: 'group',
                header: t('Group name'),
                className: 'min-w-40',
                cell: (row) => (
                  <Input
                    value={row.name}
                    aria-label={`${t('Group name')}: ${row.name}`}
                    onChange={(event) =>
                      updateRow(row._id, 'name', event.target.value)
                    }
                    aria-invalid={duplicateNames.includes(row.name.trim())}
                  />
                ),
              },
              {
                id: 'ratio',
                header: t('Ratio'),
                className: 'w-28',
                cell: (row) => (
                  <Input
                    type='number'
                    min={0}
                    step={0.1}
                    value={row.ratio}
                    onChange={(event) =>
                      updateRow(row._id, 'ratio', event.target.value)
                    }
                  />
                ),
              },
              {
                id: 'topup-ratio',
                header: t('Top-up ratio'),
                className: 'w-28',
                cell: (row) => (
                  <Input
                    type='number'
                    min={0}
                    step={0.1}
                    value={row.topupRatio}
                    placeholder={t('Not set')}
                    onChange={(event) =>
                      updateRow(row._id, 'topupRatio', event.target.value)
                    }
                  />
                ),
              },
              {
                id: 'selectable',
                header: t('User selectable'),
                className: 'w-28 text-center',
                cell: (row) => (
                  <div className='flex justify-center'>
                    <Checkbox
                      checked={row.selectable}
                      onCheckedChange={(checked) =>
                        updateRow(row._id, 'selectable', checked === true)
                      }
                      aria-label={t('User selectable')}
                    />
                  </div>
                ),
              },
              {
                id: 'hidden',
                header: t('Hidden from marketplace'),
                className: 'w-32 text-center',
                cell: (row) => (
                  <div className='flex justify-center'>
                    <Checkbox
                      checked={row.hidden}
                      onCheckedChange={(checked) =>
                        updateRow(row._id, 'hidden', checked === true)
                      }
                      aria-label={t('Hide {{group}} from model marketplace', {
                        group: row.name,
                      })}
                    />
                  </div>
                ),
              },
              {
                id: 'performance-group',
                header: t('Performance display group'),
                className: 'min-w-52',
                cell: (row) => {
                  const candidates = rows.filter(
                    (target) =>
                      target.name.trim() &&
                      target._id !== row._id &&
                      !target.hidden &&
                      !target.performanceGroup
                  )
                  const unavailable =
                    row.performanceGroup !== '' &&
                    !candidates.some(
                      (target) => target.name.trim() === row.performanceGroup
                    )
                  const hasSources = rows.some(
                    (source) => source.performanceGroup === row.name.trim()
                  )
                  return (
                    <div className='space-y-1'>
                      <Combobox
                        options={[
                          { value: '', label: t('No merge') },
                          ...candidates.map((target) => ({
                            value: target.name.trim(),
                            label: target.name.trim(),
                          })),
                        ]}
                        value={row.performanceGroup}
                        onValueChange={(value) =>
                          updateRow(row._id, 'performanceGroup', value ?? '')
                        }
                        disabled={hasSources && !row.performanceGroup}
                        aria-label={t(
                          'Performance display group for {{group}}',
                          { group: row.name }
                        )}
                        aria-invalid={unavailable}
                        className='w-full'
                      />
                      {unavailable && (
                        <p className='text-destructive text-xs'>
                          {t('Target unavailable; performance data is hidden.')}
                        </p>
                      )}
                    </div>
                  )
                },
              },
              {
                id: 'description',
                header: t('Description'),
                className: 'min-w-56',
                cell: (row) =>
                  row.selectable ? (
                    <Textarea
                      value={row.description}
                      placeholder={t('Group description')}
                      className='min-h-16 resize-y'
                      onChange={(event) =>
                        updateRow(row._id, 'description', event.target.value)
                      }
                    />
                  ) : (
                    <span className='text-muted-foreground px-3 text-sm'>
                      -
                    </span>
                  ),
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'text-right',
                cellClassName: 'text-right',
                cell: (row) => (
                  <div className='flex justify-end gap-1'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onShowDetail(row.name.trim())}
                      disabled={!row.name.trim()}
                      aria-label={t('Details')}
                    >
                      <Info className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => removeRow(row._id)}
                      aria-label={t('Delete')}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                ),
              },
            ]}
          />

          <p className='text-muted-foreground text-sm'>
            {t(
              'Performance mapping merges metrics for the same model into a visible group when no performance source rule applies. Hidden groups without a valid target are excluded. Billing, permissions and original logs stay unchanged. Targets cannot also be mapped.'
            )}
          </p>

          {duplicateNames.length > 0 && (
            <p className='text-destructive text-sm'>
              {t('Duplicate group names: {{names}}', {
                names: duplicateNames.join(', '),
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type PerformanceRuleRow = {
  scope: string
  groupName?: string
  configured: boolean
  sources: string[]
  inheritedFrom: 'default' | 'legacy-all' | 'legacy-group'
}

type PerformanceRulesEditorProps = {
  groupRatio: string
  hiddenGroups: string
  performanceGroupMapping: string
  value: string
  onChange: (value: string) => void
  fallbackValue: string
  onFallbackChange: (value: string) => void
}

function PerformanceRulesEditor(props: PerformanceRulesEditorProps) {
  const { t } = useTranslation()
  const onRulesChange = props.onChange
  const onFallbackChange = props.onFallbackChange
  const groupNames = useMemo(
    () => [
      ...new Set([...Object.keys(parseRatioMap(props.groupRatio)), 'auto']),
    ],
    [props.groupRatio]
  )
  const groupNameSet = useMemo(() => new Set(groupNames), [groupNames])
  const hiddenGroups = useMemo(
    () => parseHiddenMap(props.hiddenGroups),
    [props.hiddenGroups]
  )
  const mapping = useMemo(
    () => parseUsableMap(props.performanceGroupMapping),
    [props.performanceGroupMapping]
  )
  const rules = useMemo(() => parsePerformanceRules(props.value), [props.value])
  const fallbacks = useMemo(
    () => parsePerformanceFallbacks(props.fallbackValue),
    [props.fallbackValue]
  )

  const legacySourcesByGroup = useMemo(() => {
    const sourcesByGroup = new Map<string, string[]>()
    for (const source of groupNames) {
      const target = mapping[source]
      if (target !== undefined) {
        const targetIsValid =
          target !== source &&
          groupNameSet.has(target) &&
          hiddenGroups[target] !== true &&
          mapping[target] === undefined
        if (targetIsValid) {
          sourcesByGroup.set(target, [
            ...(sourcesByGroup.get(target) ?? []),
            source,
          ])
        }
        continue
      }
      if (hiddenGroups[source] !== true) {
        sourcesByGroup.set(source, [
          ...(sourcesByGroup.get(source) ?? []),
          source,
        ])
      }
    }
    return sourcesByGroup
  }, [groupNameSet, groupNames, hiddenGroups, mapping])

  const rows = useMemo<PerformanceRuleRow[]>(() => {
    const legacyAllSources = [...legacySourcesByGroup.values()].flat()
    const result: PerformanceRuleRow[] = [
      {
        scope: 'all',
        configured: Object.hasOwn(rules, 'all'),
        sources: rules.all ?? legacyAllSources,
        inheritedFrom: 'legacy-all',
      },
      {
        scope: 'default',
        configured: Object.hasOwn(rules, 'default'),
        sources: rules.default ?? [],
        inheritedFrom: 'legacy-group',
      },
    ]

    const configuredGroupNames = Object.keys(rules)
      .filter((scope) => scope.startsWith('group:'))
      .map((scope) => scope.slice('group:'.length))
    const displayGroups = [...new Set([...groupNames, ...configuredGroupNames])]
    for (const groupName of displayGroups) {
      const scope = `group:${groupName}`
      const configured = Object.hasOwn(rules, scope)
      const inheritsDefault = !configured && Object.hasOwn(rules, 'default')
      let sources = legacySourcesByGroup.get(groupName) ?? []
      if (inheritsDefault) sources = rules.default
      if (configured) sources = rules[scope]
      result.push({
        scope,
        groupName,
        configured,
        sources,
        inheritedFrom: inheritsDefault ? 'default' : 'legacy-group',
      })
    }
    return result
  }, [groupNames, legacySourcesByGroup, rules])

  const sourceOptions = useMemo(
    () =>
      groupNames.map((group) => ({
        value: group,
        label:
          hiddenGroups[group] === true
            ? t('{{group}} (hidden)', { group })
            : group,
      })),
    [groupNames, hiddenGroups, t]
  )

  const updateRule = useCallback(
    (scope: string, sources: string[]) => {
      onRulesChange(
        JSON.stringify({ ...rules, [scope]: [...new Set(sources)] }, null, 2)
      )
    },
    [onRulesChange, rules]
  )

  const inheritRule = useCallback(
    (scope: string) => {
      const next = { ...rules }
      delete next[scope]
      onRulesChange(JSON.stringify(next, null, 2))
    },
    [onRulesChange, rules]
  )

  const setFallback = useCallback(
    (scope: string, enabled: boolean) => {
      onFallbackChange(
        JSON.stringify({ ...fallbacks, [scope]: enabled }, null, 2)
      )
    },
    [fallbacks, onFallbackChange]
  )

  const inheritFallback = useCallback(
    (scope: string) => {
      const next = { ...fallbacks }
      delete next[scope]
      onFallbackChange(JSON.stringify(next, null, 2))
    },
    [fallbacks, onFallbackChange]
  )

  return (
    <Card className={sectionCardClassName}>
      <CardHeader className={sectionHeaderClassName}>
        <CardTitle>{t('Performance source rules')}</CardTitle>
        <CardDescription>
          {t(
            'Choose the original groups whose metrics appear in each marketplace scope. Explicit rules take priority over the legacy performance mapping; selecting no sources intentionally shows no performance data.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <TooltipProvider>
          <StaticDataTable
            tableClassName='min-w-[62rem]'
            data={rows}
            getRowKey={(row) => row.scope}
            columns={[
              {
                id: 'scope',
                header: t('Marketplace scope'),
                className: 'min-w-44',
                cell: (row) => {
                  let label = row.groupName
                  if (row.scope === 'all') label = t('All groups view')
                  if (row.scope === 'default') {
                    label = t('Default for display groups')
                  }
                  const groupName = row.groupName
                  const unknownGroup =
                    groupName !== undefined && !groupNameSet.has(groupName)
                  const hiddenGroup =
                    groupName !== undefined && hiddenGroups[groupName] === true
                  return (
                    <div className='flex flex-col items-start gap-1'>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium'>{label}</span>
                        {unknownGroup && <UnknownGroupBadge />}
                        {hiddenGroup && (
                          <StatusBadge variant='neutral' copyable={false}>
                            {t('Hidden from marketplace')}
                          </StatusBadge>
                        )}
                      </div>
                      {(unknownGroup || hiddenGroup) && (
                        <span className='text-muted-foreground text-xs'>
                          {t(
                            'This scope is not exposed in the marketplace; its source rule is retained but not shown publicly.'
                          )}
                        </span>
                      )}
                    </div>
                  )
                },
              },
              {
                id: 'status',
                header: t('Rule status'),
                className: 'min-w-40',
                cell: (row) => {
                  let inheritedLabel = t('Legacy mapping')
                  if (row.inheritedFrom === 'default') {
                    inheritedLabel = t('Inherits default rule')
                  }
                  if (row.inheritedFrom === 'legacy-all') {
                    inheritedLabel = t('Legacy public sources')
                  }
                  return row.configured ? (
                    <div className='flex flex-col items-start gap-1'>
                      <StatusBadge variant='info' copyable={false}>
                        {t('Explicit rule')}
                      </StatusBadge>
                      {row.sources.length === 0 && (
                        <span className='text-muted-foreground text-xs'>
                          {t('No performance data')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <StatusBadge variant='neutral' copyable={false}>
                      {inheritedLabel}
                    </StatusBadge>
                  )
                },
              },
              {
                id: 'sources',
                header: t('Original source groups'),
                className: 'min-w-80',
                cell: (row) => {
                  let scopeLabel = row.groupName ?? row.scope
                  if (row.scope === 'all') scopeLabel = t('All groups view')
                  if (row.scope === 'default') {
                    scopeLabel = t('Default for display groups')
                  }
                  const inputId = `performance-sources-${encodeURIComponent(row.scope)}`
                  const unknownSources = row.sources.filter(
                    (source) => !groupNameSet.has(source)
                  )
                  const mismatchedSources = row.groupName
                    ? row.sources.filter((source) => source !== row.groupName)
                    : []
                  const showWarning =
                    unknownSources.length > 0 || mismatchedSources.length > 0
                  const sourceLabel = t('Performance sources for {{scope}}', {
                    scope: scopeLabel,
                  })

                  return (
                    <div className='flex items-start gap-1'>
                      <div className='min-w-72 flex-1'>
                        <Label htmlFor={inputId} className='sr-only'>
                          {sourceLabel}
                        </Label>
                        <MultiSelect
                          id={inputId}
                          options={sourceOptions}
                          selected={row.sources}
                          onChange={(sources) => updateRule(row.scope, sources)}
                          placeholder={sourceLabel}
                          disabled={!row.configured}
                          maxVisibleChips={4}
                        />
                      </div>
                      {showWarning && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='text-destructive shrink-0 cursor-help'
                                aria-label={t(
                                  'Review performance sources for {{scope}}',
                                  { scope: scopeLabel }
                                )}
                              />
                            }
                          >
                            <AlertTriangle aria-hidden='true' />
                          </TooltipTrigger>
                          <TooltipContent className='flex max-w-sm flex-col items-start gap-1'>
                            {unknownSources.length > 0 && (
                              <p>
                                {t(
                                  'Unknown source groups are retained and match no current pricing group: {{groups}}.',
                                  { groups: unknownSources.join(', ') }
                                )}
                              </p>
                            )}
                            {mismatchedSources.length > 0 && (
                              <p>
                                {t(
                                  'Performance for {{group}} includes groups sold under other names: {{groups}}.',
                                  {
                                    group: row.groupName,
                                    groups: mismatchedSources.join(', '),
                                  }
                                )}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )
                },
              },
              {
                id: 'fallback',
                header: t('Fallback to this group'),
                className: 'min-w-56',
                cell: (row) => {
                  if (row.scope === 'all') {
                    return (
                      <span className='text-muted-foreground text-sm'>
                        {t('Not applicable')}
                      </span>
                    )
                  }
                  const configured =
                    row.scope === 'default' ||
                    Object.hasOwn(fallbacks, row.scope)
                  const enabled = configured
                    ? (fallbacks[row.scope] ?? false)
                    : (fallbacks.default ?? false)
                  const label = row.groupName
                    ? t('Fallback to {{group}} when sources have no data', {
                        group: row.groupName,
                      })
                    : t('Default fallback to the selected group')
                  return (
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        checked={enabled}
                        disabled={!configured}
                        onCheckedChange={(checked) =>
                          setFallback(row.scope, checked === true)
                        }
                        aria-label={label}
                      />
                      {row.scope !== 'default' &&
                        (configured ? (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => inheritFallback(row.scope)}
                            aria-label={`${t('Use inherited')}: ${label}`}
                          >
                            {t('Use inherited')}
                          </Button>
                        ) : (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => setFallback(row.scope, enabled)}
                            aria-label={`${t('Override')}: ${label}`}
                          >
                            {t('Override')}
                          </Button>
                        ))}
                      {row.configured && row.sources.length === 0 && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='text-muted-foreground shrink-0 cursor-help'
                                aria-label={t('Fallback unavailable')}
                              />
                            }
                          >
                            <Info aria-hidden='true' />
                          </TooltipTrigger>
                          <TooltipContent className='max-w-sm'>
                            {t(
                              'Fallback is ignored when the source rule intentionally has no sources.'
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )
                },
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'w-36 text-right',
                cellClassName: 'text-right',
                cell: (row) =>
                  row.configured ? (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => inheritRule(row.scope)}
                    >
                      {t('Use inherited')}
                    </Button>
                  ) : (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => updateRule(row.scope, row.sources)}
                    >
                      {t('Override')}
                    </Button>
                  ),
              },
            ]}
          />
        </TooltipProvider>
        <p className='text-muted-foreground text-sm'>
          {t(
            'The all rule applies when no marketplace group is selected. A group rule overrides the default rule; without either, the legacy performance mapping remains in effect. Source arrays use original group names, including hidden groups, and are never resolved recursively.'
          )}
        </p>
      </CardContent>
    </Card>
  )
}

type GroupOverride = {
  targetGroup: string
  ratio: number
}

type GroupOverrideRulesProps = {
  registry: RegistryEntry[]
  groupGroupRatio: string
  onChange: (field: string, value: string) => void
}

function GroupOverrideRules({
  registry,
  groupGroupRatio,
  onChange,
}: GroupOverrideRulesProps) {
  const { t } = useTranslation()
  const [userGroupDialogOpen, setUserGroupDialogOpen] = useState(false)
  const [userGroupInput, setUserGroupInput] = useState<string | null>(null)
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [overrideUserGroup, setOverrideUserGroup] = useState<string | null>(
    null
  )
  const [overrideEditData, setOverrideEditData] =
    useState<GroupOverride | null>(null)

  const registryNames = useMemo(
    () => registry.map((entry) => entry.name),
    [registry]
  )

  const baseRatioByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of registry) map.set(entry.name, entry.ratio)
    return map
  }, [registry])

  const groupGroupRatioList = useMemo(() => {
    const map = parseNestedRatioMap(groupGroupRatio)
    return Object.entries(map).map(([userGroup, overrides]) => ({
      userGroup,
      overrides: Object.entries(overrides).map(([targetGroup, ratio]) => ({
        targetGroup,
        ratio,
      })),
    }))
  }, [groupGroupRatio])

  const emitMap = useCallback(
    (map: Record<string, Record<string, number>>) => {
      onChange('GroupGroupRatio', JSON.stringify(map, null, 2))
    },
    [onChange]
  )

  const handleUserGroupSave = useCallback(() => {
    if (!userGroupInput) return
    const map = parseNestedRatioMap(groupGroupRatio)
    if (!map[userGroupInput]) {
      map[userGroupInput] = {}
    }
    emitMap(map)
    setUserGroupDialogOpen(false)
    setUserGroupInput(null)
  }, [userGroupInput, groupGroupRatio, emitMap])

  const handleUserGroupDelete = useCallback(
    (userGroup: string) => {
      const map = parseNestedRatioMap(groupGroupRatio)
      delete map[userGroup]
      emitMap(map)
    },
    [groupGroupRatio, emitMap]
  )

  const handleOverrideAdd = useCallback((userGroup: string) => {
    setOverrideUserGroup(userGroup)
    setOverrideEditData(null)
    setOverrideDialogOpen(true)
  }, [])

  const handleOverrideEdit = useCallback(
    (userGroup: string, override: GroupOverride) => {
      setOverrideUserGroup(userGroup)
      setOverrideEditData(override)
      setOverrideDialogOpen(true)
    },
    []
  )

  const handleOverrideSave = useCallback(
    (targetGroup: string, ratio: number, oldTargetGroup?: string) => {
      if (!overrideUserGroup) return
      const map = parseNestedRatioMap(groupGroupRatio)
      if (!map[overrideUserGroup]) {
        map[overrideUserGroup] = {}
      }
      if (oldTargetGroup && oldTargetGroup !== targetGroup) {
        delete map[overrideUserGroup][oldTargetGroup]
      }
      map[overrideUserGroup][targetGroup] = ratio
      emitMap(map)
      setOverrideDialogOpen(false)
    },
    [overrideUserGroup, groupGroupRatio, emitMap]
  )

  const handleOverrideDelete = useCallback(
    (userGroup: string, targetGroup: string) => {
      const map = parseNestedRatioMap(groupGroupRatio)
      if (map[userGroup]) {
        delete map[userGroup][targetGroup]
        if (Object.keys(map[userGroup]).length === 0) {
          delete map[userGroup]
        }
      }
      emitMap(map)
    },
    [groupGroupRatio, emitMap]
  )

  return (
    <Card className={sectionCardClassName}>
      <CardHeader className={sectionHeaderClassName}>
        <CardTitle>{t('Special ratio rules')}</CardTitle>
        <CardDescription>
          {t(
            'Each rule reads as a sentence: users of one group pay a special ratio when billed as another group. Without a rule, the billing group base ratio applies.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          <Button
            onClick={() => {
              setUserGroupInput(null)
              setUserGroupDialogOpen(true)
            }}
            size='sm'
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('Add user group')}
          </Button>
          {groupGroupRatioList.length > 0 && (
            <div className='space-y-3'>
              {groupGroupRatioList.map((userGroupData) => (
                <Collapsible key={userGroupData.userGroup}>
                  <div className='rounded-lg border'>
                    <div className='flex items-center justify-between p-4'>
                      <div className='flex items-center gap-2'>
                        <CollapsibleTrigger
                          render={<Button variant='ghost' size='sm' />}
                        >
                          <ChevronDown className='h-4 w-4' />
                        </CollapsibleTrigger>
                        <span className='font-semibold'>
                          {userGroupData.userGroup}
                        </span>
                        {!registryNames.includes(userGroupData.userGroup) && (
                          <AlertTriangle
                            className='text-destructive h-4 w-4'
                            aria-label={t('Not in pricing table')}
                          />
                        )}
                        <span className='text-muted-foreground text-sm'>
                          {t('{{count}} override', {
                            count: userGroupData.overrides.length,
                          })}
                        </span>
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            handleOverrideAdd(userGroupData.userGroup)
                          }
                        >
                          <Plus className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            handleUserGroupDelete(userGroupData.userGroup)
                          }
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                    <CollapsibleContent>
                      {userGroupData.overrides.length > 0 && (
                        <div className='border-t'>
                          <StaticDataTable
                            className='rounded-none border-0'
                            data={userGroupData.overrides}
                            getRowKey={(override) => override.targetGroup}
                            columns={[
                              {
                                id: 'target-group',
                                header: t('Billing group'),
                                cellClassName: 'font-medium',
                                cell: (override) => (
                                  <span className='inline-flex items-center gap-1.5'>
                                    {override.targetGroup}
                                    {!registryNames.includes(
                                      override.targetGroup
                                    ) && (
                                      <AlertTriangle
                                        className='text-destructive h-3.5 w-3.5'
                                        aria-label={t('Not in pricing table')}
                                      />
                                    )}
                                  </span>
                                ),
                              },
                              {
                                id: 'ratio',
                                header: t('Ratio'),
                                cell: (override) => {
                                  const baseRatio = baseRatioByName.get(
                                    override.targetGroup
                                  )
                                  return (
                                    <span className='inline-flex items-center gap-1.5'>
                                      {override.ratio}
                                      {baseRatio !== undefined &&
                                        baseRatio !== override.ratio && (
                                          <span className='text-muted-foreground text-xs'>
                                            {t('(instead of {{ratio}})', {
                                              ratio: baseRatio,
                                            })}
                                          </span>
                                        )}
                                    </span>
                                  )
                                },
                              },
                              {
                                id: 'actions',
                                header: t('Actions'),
                                className: 'text-right',
                                cellClassName: 'text-right',
                                cell: (override) => (
                                  <StaticRowActions
                                    editLabel={t('Edit')}
                                    deleteLabel={t('Delete')}
                                    menuLabel={t('Open menu')}
                                    onEdit={() =>
                                      handleOverrideEdit(
                                        userGroupData.userGroup,
                                        override
                                      )
                                    }
                                    onDelete={() =>
                                      handleOverrideDelete(
                                        userGroupData.userGroup,
                                        override.targetGroup
                                      )
                                    }
                                  />
                                ),
                              },
                            ]}
                          />
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Add user group dialog */}
      <Dialog
        open={userGroupDialogOpen}
        onOpenChange={setUserGroupDialogOpen}
        title={t('Add user group')}
        description={t(
          'Create a new user group to configure ratio overrides for.'
        )}
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setUserGroupDialogOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleUserGroupSave} disabled={!userGroupInput}>
              {t('Add')}
            </Button>
          </>
        }
      >
        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label>{t('User group name')}</Label>
            <GroupNameSelect
              className='w-full'
              options={registryNames}
              value={userGroupInput}
              placeholder={t('Select a group')}
              onValueChange={setUserGroupInput}
            />
          </div>
        </div>
      </Dialog>

      <GroupOverrideDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        onSave={handleOverrideSave}
        editData={overrideEditData}
        userGroup={overrideUserGroup}
        groupOptions={registryNames}
        baseRatioByName={baseRatioByName}
      />
    </Card>
  )
}

type GroupOverrideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (targetGroup: string, ratio: number, oldTargetGroup?: string) => void
  editData: GroupOverride | null
  userGroup: string | null
  groupOptions: string[]
  baseRatioByName: Map<string, number>
}

function GroupOverrideDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  userGroup,
  groupOptions,
  baseRatioByName,
}: GroupOverrideDialogProps) {
  const { t } = useTranslation()
  const [targetGroup, setTargetGroup] = useState<string | null>(null)
  const [ratio, setRatio] = useState('')

  const [previousEditData, setPreviousEditData] = useState(editData)
  const [previousOpen, setPreviousOpen] = useState(open)
  if (editData !== previousEditData || open !== previousOpen) {
    setPreviousEditData(editData)
    setPreviousOpen(open)
    setTargetGroup(open ? (editData?.targetGroup ?? null) : null)
    setRatio(open && editData ? String(editData.ratio) : '')
  }

  const baseRatio = targetGroup ? baseRatioByName.get(targetGroup) : undefined

  const handleSave = () => {
    if (!targetGroup || !ratio.trim()) return
    const parsedRatio = Number.parseFloat(ratio)
    if (Number.isNaN(parsedRatio)) return

    onSave(targetGroup, parsedRatio, editData?.targetGroup)
    setTargetGroup(null)
    setRatio('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editData ? t('Edit ratio override') : t('Add ratio override')}
      description={
        userGroup
          ? t(
              'Configure a custom ratio for "{{userGroup}}" users when using a specific token group.',
              { userGroup }
            )
          : t(
              'Configure a custom ratio for when users use a specific token group.'
            )
      }
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave}>
            {editData ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <div className='space-y-4 py-4'>
        <div className='space-y-2'>
          <Label>{t('Billing group')}</Label>
          <GroupNameSelect
            className='w-full'
            options={groupOptions}
            value={targetGroup}
            placeholder={t('Select a group')}
            onValueChange={setTargetGroup}
          />
          <p className='text-muted-foreground text-xs'>
            {t('The token group that will have a custom ratio')}
          </p>
        </div>
        <div className='space-y-2'>
          <Label>{t('Ratio')}</Label>
          <Input
            value={ratio}
            onChange={(e) => {
              const val = e.target.value
              if (val === '' || !Number.isNaN(Number.parseFloat(val))) {
                setRatio(val)
              }
            }}
            placeholder={baseRatio === undefined ? '0.9' : String(baseRatio)}
          />
          <p className='text-muted-foreground text-xs'>
            {baseRatio !== undefined
              ? t('(instead of {{ratio}})', { ratio: baseRatio })
              : t(
                  'Multiplier applied when {{userGroup}} uses {{targetGroup}}',
                  {
                    userGroup: userGroup || t('this user group'),
                    targetGroup: targetGroup || t('this token group'),
                  }
                )}
          </p>
        </div>
      </div>
    </Dialog>
  )
}

type GroupDetailSheetProps = {
  groupName: string | null
  onOpenChange: (open: boolean) => void
  registry: RegistryEntry[]
  topupGroupRatio: string
  userUsableGroups: string
  groupGroupRatio: string
  autoGroups: string[]
  groupSpecialUsableGroup: string
}

type VisibilityRule = {
  userGroup: string
  visible: boolean
  description: string
}

function parseSpecialGroupKey(rawKey: string): {
  visible: boolean
  groupName: string
} {
  if (rawKey.startsWith('-:')) {
    return { visible: false, groupName: rawKey.slice(2) }
  }
  if (rawKey.startsWith('+:')) {
    return { visible: true, groupName: rawKey.slice(2) }
  }
  return { visible: true, groupName: rawKey }
}

function GroupDetailSheet(props: GroupDetailSheetProps) {
  const { t } = useTranslation()
  const name = props.groupName

  const detail = useMemo(() => {
    if (!name) return null

    const entry = props.registry.find((item) => item.name === name)
    const topupMap = parseRatioMap(props.topupGroupRatio)
    const usableMap = parseUsableMap(props.userUsableGroups)
    const overrideMap = parseNestedRatioMap(props.groupGroupRatio)
    const specialMap = safeJsonParse<Record<string, Record<string, string>>>(
      props.groupSpecialUsableGroup,
      { fallback: {}, silent: true }
    )

    // Overrides that apply when other user groups bill as this group
    const incomingOverrides: { userGroup: string; ratio: number }[] = []
    for (const [userGroup, overrides] of Object.entries(overrideMap)) {
      if (Object.hasOwn(overrides, name)) {
        incomingOverrides.push({ userGroup, ratio: overrides[name] })
      }
    }

    // Overrides that apply when users of this group bill as other groups
    const outgoingOverrides = Object.entries(overrideMap[name] ?? {}).map(
      ([targetGroup, ratio]) => ({ targetGroup, ratio })
    )

    // Visibility rules targeting this group
    const visibilityRules: VisibilityRule[] = []
    for (const [userGroup, inner] of Object.entries(specialMap)) {
      if (typeof inner !== 'object' || inner === null) continue
      for (const [rawKey, desc] of Object.entries(inner)) {
        const parsed = parseSpecialGroupKey(rawKey)
        if (parsed.groupName !== name) continue
        visibilityRules.push({
          userGroup,
          visible: parsed.visible,
          description: typeof desc === 'string' ? desc : '',
        })
      }
    }

    const autoIndex = props.autoGroups.indexOf(name)

    return {
      ratio: entry?.ratio,
      topupRatio: Object.hasOwn(topupMap, name) ? String(topupMap[name]) : null,
      selectable: Object.hasOwn(usableMap, name),
      description: String(usableMap[name] ?? ''),
      incomingOverrides,
      outgoingOverrides,
      visibilityRules,
      autoIndex,
    }
  }, [
    name,
    props.registry,
    props.topupGroupRatio,
    props.userUsableGroups,
    props.groupGroupRatio,
    props.autoGroups,
    props.groupSpecialUsableGroup,
  ])

  return (
    <Sheet open={name !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName('sm:max-w-lg')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {t('Group details')}
            {name ? `: ${name}` : ''}
          </SheetTitle>
          <SheetDescription>
            {t('Everything configured for this group, in one place.')}
          </SheetDescription>
        </SheetHeader>

        {detail && (
          <div className={sideDrawerFormClassName('gap-5')}>
            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>{t('Overview')}</h3>
              <dl className='space-y-1.5 text-sm'>
                <div className='flex justify-between'>
                  <dt className='text-muted-foreground'>{t('Ratio')}</dt>
                  <dd className='font-medium'>{detail.ratio ?? '-'}</dd>
                </div>
                <div className='flex justify-between'>
                  <dt className='text-muted-foreground'>{t('Top-up ratio')}</dt>
                  <dd className='font-medium'>
                    {detail.topupRatio ?? t('Not set')}
                  </dd>
                </div>
                <div className='flex justify-between'>
                  <dt className='text-muted-foreground'>
                    {t('User selectable')}
                  </dt>
                  <dd className='font-medium'>
                    {detail.selectable ? t('Yes') : t('No')}
                  </dd>
                </div>
                {detail.selectable && detail.description && (
                  <div className='flex justify-between gap-4'>
                    <dt className='text-muted-foreground'>
                      {t('Description')}
                    </dt>
                    <dd className='text-right font-medium'>
                      {detail.description}
                    </dd>
                  </div>
                )}
                <div className='flex justify-between'>
                  <dt className='text-muted-foreground'>
                    {t('Auto assignment order')}
                  </dt>
                  <dd className='font-medium'>
                    {detail.autoIndex >= 0
                      ? t('Position {{position}}', {
                          position: detail.autoIndex + 1,
                        })
                      : t('Not included')}
                  </dd>
                </div>
              </dl>
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('Ratio overrides when billed as this group')}
              </h3>
              {detail.incomingOverrides.length === 0 ? (
                <p className='text-muted-foreground text-sm'>{t('None')}</p>
              ) : (
                <ul className='space-y-1 text-sm'>
                  {detail.incomingOverrides.map((item) => (
                    <li
                      key={item.userGroup}
                      className='flex justify-between rounded-md border px-3 py-1.5'
                    >
                      <span>
                        {t('Users in {{group}}', { group: item.userGroup })}
                      </span>
                      <span className='font-medium'>{item.ratio}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('Ratio overrides for users of this group')}
              </h3>
              {detail.outgoingOverrides.length === 0 ? (
                <p className='text-muted-foreground text-sm'>{t('None')}</p>
              ) : (
                <ul className='space-y-1 text-sm'>
                  {detail.outgoingOverrides.map((item) => (
                    <li
                      key={item.targetGroup}
                      className='flex justify-between rounded-md border px-3 py-1.5'
                    >
                      <span>
                        {t('When billed as {{group}}', {
                          group: item.targetGroup,
                        })}
                      </span>
                      <span className='font-medium'>{item.ratio}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('Special visibility rules')}
              </h3>
              {detail.visibilityRules.length === 0 ? (
                <p className='text-muted-foreground text-sm'>{t('None')}</p>
              ) : (
                <ul className='space-y-1 text-sm'>
                  {detail.visibilityRules.map((rule) => (
                    <li
                      key={`${rule.userGroup}-${rule.visible}`}
                      className='flex items-center justify-between rounded-md border px-3 py-1.5'
                    >
                      <span>
                        {rule.visible
                          ? t('Extra visible to {{group}}', {
                              group: rule.userGroup,
                            })
                          : t('Hidden from {{group}}', {
                              group: rule.userGroup,
                            })}
                      </span>
                      <StatusBadge
                        variant={rule.visible ? 'info' : 'danger'}
                        copyable={false}
                      >
                        {rule.visible ? t('Visible') : t('Hidden')}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
