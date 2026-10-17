import { zodResolver } from '@hookform/resolvers/zod'
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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { normalizeGroupPerformanceConfig } from '../group-performance-config'
import { GroupRatioForm } from '../group-ratio-form'
import { GroupRatioVisualEditor } from '../group-ratio-visual-editor'
import { createGroupSchema } from '../ratio-settings-card'

const validGroupFormValues = {
  GroupRatio: '{}',
  TopupGroupRatio: '{}',
  UserUsableGroups: '{}',
  GroupGroupRatio: '{}',
  AutoGroups: '[]',
  MaxTokenAutoGroups: 5,
  DefaultUseAutoGroup: false,
  GroupSpecialUsableGroup: '{}',
  HiddenGroups: '{}',
  PerformanceGroupMapping: '{}',
  PerformanceRules: '{}',
  PerformanceFallbacks: '{}',
}

function Harness(props: {
  initialHiddenGroups?: string
  initialMapping?: string
  initialRules?: string
  initialFallbacks?: string
}) {
  const [groupRatio, setGroupRatio] = useState('{"default":1,"internal":0}')
  const [usableGroups, setUsableGroups] = useState(
    '{"default":"Default","internal":"Internal"}'
  )
  const [mapping, setMapping] = useState(props.initialMapping ?? '{}')
  const [rules, setRules] = useState(props.initialRules ?? '{}')
  const [fallbacks, setFallbacks] = useState(props.initialFallbacks ?? '{}')
  const [hiddenGroups, setHiddenGroups] = useState(
    props.initialHiddenGroups ?? '{}'
  )
  return (
    <>
      <GroupRatioVisualEditor
        groupRatio={groupRatio}
        topupGroupRatio='{}'
        userUsableGroups={usableGroups}
        groupGroupRatio='{}'
        autoGroups='[]'
        maxTokenAutoGroupsField={null}
        groupSpecialUsableGroup='{}'
        hiddenGroups={hiddenGroups}
        performanceGroupMapping={mapping}
        performanceRules={rules}
        performanceFallbacks={fallbacks}
        onChange={(field, value) => {
          if (field === 'HiddenGroups') setHiddenGroups(value)
          if (field === 'PerformanceGroupMapping') setMapping(value)
          if (field === 'PerformanceRules') setRules(value)
          if (field === 'PerformanceFallbacks') setFallbacks(value)
          if (field === 'GroupRatio') setGroupRatio(value)
          if (field === 'UserUsableGroups') setUsableGroups(value)
        }}
      />
      <output aria-label='Saved hidden groups'>{hiddenGroups}</output>
      <output aria-label='Saved performance mapping'>{mapping}</output>
      <output aria-label='Saved performance rules'>{rules}</output>
      <output aria-label='Saved performance fallbacks'>{fallbacks}</output>
      <output aria-label='Saved ratios'>{groupRatio}</output>
      <output aria-label='Saved usable groups'>{usableGroups}</output>
    </>
  )
}

function GroupFormHarness(props: {
  onSave: (values: typeof validGroupFormValues) => Promise<void>
}) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const form = useForm({
    resolver: zodResolver(createGroupSchema((key) => key)),
    defaultValues: {
      ...validGroupFormValues,
      GroupRatio: '{"default":1,"internal":0}',
      UserUsableGroups: '{"default":"Default"}',
      HiddenGroups: '{"internal":true}',
      PerformanceGroupMapping: '{"internal":"default"}',
      PerformanceRules: '{"group:removed":[]}',
      AutoGroups: '["removed"]',
    },
  })
  return (
    <SettingsPageProvider actionsContainer={actions}>
      <div ref={setActions} />
      <output aria-label='Form save state'>
        {form.formState.isSubmitting ? 'saving' : 'idle'}
      </output>
      <GroupRatioForm form={form} onSave={props.onSave} isSaving={false} />
    </SettingsPageProvider>
  )
}

describe('group marketplace visibility', () => {
  it('accepts only documented performance scope keys while preserving explicit empty arrays', () => {
    const schema = createGroupSchema((key) => key)
    expect(
      schema.safeParse({
        ...validGroupFormValues,
        PerformanceRules: '{"group:stable":[]}',
      }).success
    ).toBe(true)
    expect(
      schema.safeParse({
        ...validGroupFormValues,
        PerformanceRules: '{"unexpected":[]}',
      }).success
    ).toBe(false)
    expect(
      schema.safeParse({
        ...validGroupFormValues,
        PerformanceRules: 'null',
      }).success
    ).toBe(false)
  })

  it('keeps editable pricing columns readable when the hidden-group column is present', () => {
    render(<Harness />)
    expect(screen.getAllByRole('table')[0]).toHaveClass('min-w-[62rem]')
    expect(
      screen.queryByRole('columnheader', { name: 'Performance display group' })
    ).not.toBeInTheDocument()
  })

  it.each([
    ['GroupRatio', 'null'],
    ['GroupRatio', '[]'],
    ['GroupRatio', '{"public":-1}'],
    ['HiddenGroups', 'null'],
    ['HiddenGroups', '{"internal":"true"}'],
  ])(
    'rejects invalid %s map before preparing a migration: %s',
    (field, value) => {
      expect(
        createGroupSchema((key) => key).safeParse({
          ...validGroupFormValues,
          [field]: value,
        }).success
      ).toBe(false)
    }
  )

  it('preserves multiline group descriptions while keeping non-selectable groups read-only', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const defaultRow = screen
      .getByRole('textbox', { name: 'Group name: default' })
      .closest('tr')
    expect(defaultRow).not.toBeNull()
    if (!defaultRow) throw new Error('Missing default pricing row')

    const description =
      within(defaultRow).getByPlaceholderText('Group description')
    expect(description).toHaveValue('Default')
    await user.clear(description)
    await user.type(description, 'Fast models ⚡\nFor daily use 🚀')

    expect(
      JSON.parse(
        screen.getByLabelText('Saved usable groups').textContent ?? '{}'
      )
    ).toEqual({
      default: 'Fast models ⚡\nFor daily use 🚀',
      internal: 'Internal',
    })

    const selectable = within(defaultRow).getByRole('checkbox', {
      name: 'User selectable',
    })
    await user.click(selectable)
    expect(
      within(defaultRow).queryByPlaceholderText('Group description')
    ).not.toBeInTheDocument()
    expect(
      JSON.parse(
        screen.getByLabelText('Saved usable groups').textContent ?? '{}'
      )
    ).toEqual({ internal: 'Internal' })
  })

  it('hides a group without changing its availability for API keys', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const visibility = screen.getByRole('checkbox', {
      name: 'Hide internal from model marketplace',
    })
    expect(visibility).not.toBeChecked()
    await user.click(visibility)
    expect(visibility).toBeChecked()
    expect(
      JSON.parse(
        screen.getByLabelText('Saved hidden groups').textContent ?? '{}'
      )
    ).toEqual({ internal: true })
    const selectableControls = screen.getAllByRole('checkbox', {
      name: 'User selectable',
    })
    expect(selectableControls).toHaveLength(2)
    for (const control of selectableControls) expect(control).toBeChecked()
  })

  it('loads persisted visibility and allows restoring a group', async () => {
    render(<Harness initialHiddenGroups='{"internal":true}' />)
    const user = userEvent.setup()
    const visibility = screen.getByRole('checkbox', {
      name: 'Hide internal from model marketplace',
    })
    expect(visibility).toBeChecked()
    await user.click(visibility)
    expect(visibility).not.toBeChecked()
    expect(
      JSON.parse(
        screen.getByLabelText('Saved hidden groups').textContent ?? '{}'
      )
    ).toEqual({})
  })

  it('selects hidden sources in the single source editor without changing prices or visibility', async () => {
    render(<Harness initialHiddenGroups='{"internal":true}' />)
    const user = userEvent.setup()
    const row = screen
      .getByRole('combobox', { name: 'Performance sources for default' })
      .closest('tr')
    if (!row) throw new Error('Missing source rule row')
    await user.click(
      within(row).getByRole('button', { name: 'Customize sources' })
    )
    const selector = screen.getByRole('combobox', {
      name: 'Performance sources for default',
    })
    await user.click(selector)
    await user.click(screen.getByRole('option', { name: 'internal (hidden)' }))
    await user.keyboard('{Escape}')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({ 'group:default': ['default', 'internal'] })
    expect(
      JSON.parse(screen.getByLabelText('Saved ratios').textContent ?? '{}')
    ).toEqual({ default: 1, internal: 0 })
    expect(
      screen.getByRole('checkbox', {
        name: 'Hide internal from model marketplace',
      })
    ).toBeChecked()
    await user.keyboard('{Escape}')
    await user.click(within(row).getByRole('button', { name: 'Reset sources' }))
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({})
  })

  it('preserves incoming mappings when a target is renamed and hides data when that target is deleted', async () => {
    render(
      <Harness
        initialHiddenGroups='{"internal":true}'
        initialMapping='{"internal":"default"}'
      />
    )
    const user = userEvent.setup()
    const name = screen.getByRole('textbox', { name: 'Group name: default' })
    await user.clear(name)
    await user.type(name, 'stable')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance mapping').textContent ?? '{}'
      )
    ).toEqual({ internal: 'stable' })
    const row = screen
      .getByRole('textbox', { name: 'Group name: stable' })
      .closest('tr')
    expect(row).not.toBeNull()
    if (!row) throw new Error('Missing target group row')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(
      screen.queryByRole('combobox', { name: 'Performance sources for stable' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('combobox', {
        name: 'Performance sources for All groups view',
      })
    ).toHaveValue('')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance mapping').textContent ?? '{}'
      )
    ).toEqual({ internal: 'stable' })
  })

  it('distinguishes inherited rules from an explicit empty source list', async () => {
    render(
      <Harness initialRules='{"default":["internal"],"group:default":[]}' />
    )
    const user = userEvent.setup()
    const defaultGroupRow = screen
      .getByRole('combobox', { name: 'Performance sources for default' })
      .closest('tr')
    expect(defaultGroupRow).not.toBeNull()
    if (!defaultGroupRow) throw new Error('Missing default group rule')
    expect(within(defaultGroupRow).getByText('Explicit rule')).toBeVisible()
    expect(
      within(defaultGroupRow).getByText('No performance data')
    ).toBeVisible()
    expect(
      within(defaultGroupRow).getByRole('button', {
        name: 'Fallback unavailable',
      })
    ).toBeVisible()

    const internalGroupRow = screen
      .getByRole('combobox', { name: 'Performance sources for internal' })
      .closest('tr')
    expect(internalGroupRow).not.toBeNull()
    if (!internalGroupRow) throw new Error('Missing internal group rule')
    expect(
      within(internalGroupRow).getByText('Inherits default rule')
    ).toBeVisible()

    await user.click(
      within(defaultGroupRow).getByRole('button', {
        name: 'Reset sources',
      })
    )
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({ default: ['internal'] })
    expect(
      within(defaultGroupRow).getByText('Inherits default rule')
    ).toBeVisible()
  })

  it('inherits fallback defaults and preserves explicit false overrides', async () => {
    render(<Harness initialFallbacks='{"default":true}' />)
    const user = userEvent.setup()
    const defaultFallback = screen.getByRole('combobox', {
      name: 'Default fallback to the selected group',
    })
    expect(defaultFallback).toHaveValue(
      'Use this group if sources have no data'
    )

    const groupFallback = screen.getByRole('combobox', {
      name: 'Fallback to default when sources have no data',
    })
    expect(groupFallback).toHaveValue('Follow global fallback: Enabled')
    await user.click(groupFallback)
    await user.click(
      screen.getByRole('option', {
        name: 'Show no data if sources have no data',
      })
    )
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance fallbacks').textContent ?? '{}'
      )
    ).toEqual({ default: true, 'group:default': false })

    await user.click(groupFallback)
    await user.click(
      screen.getByRole('option', { name: 'Follow global fallback: Enabled' })
    )
    expect(groupFallback).toHaveValue('Follow global fallback: Enabled')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance fallbacks').textContent ?? '{}'
      )
    ).toEqual({ default: true })
  })

  it('renames and deletes group fallback overrides with their pricing group', async () => {
    render(<Harness initialFallbacks='{"group:default":true}' />)
    const user = userEvent.setup()
    const name = screen.getByRole('textbox', { name: 'Group name: default' })
    await user.clear(name)
    await user.type(name, 'stable')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance fallbacks').textContent ?? '{}'
      )
    ).toEqual({ 'group:stable': true })

    const row = screen
      .getByRole('textbox', { name: 'Group name: stable' })
      .closest('tr')
    expect(row).not.toBeNull()
    if (!row) throw new Error('Missing renamed pricing row')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance fallbacks').textContent ?? '{}'
      )
    ).toEqual({})
  })

  it('edits a default source rule with the shared multi-select', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const defaultRuleRow = screen
      .getByText('Global default sources (not a group)')
      .closest('tr')
    expect(defaultRuleRow).not.toBeNull()
    if (!defaultRuleRow) throw new Error('Missing default performance rule')

    await user.click(
      within(defaultRuleRow).getByRole('button', { name: 'Customize sources' })
    )
    const sourceSelector = within(defaultRuleRow).getByRole('combobox', {
      name: 'Performance sources for Global default sources (not a group)',
    })
    await user.click(sourceSelector)
    await user.click(screen.getByRole('option', { name: 'internal' }))
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({ default: ['internal'] })
  })

  it('copies every active source including auto when overriding the inherited all rule', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const allRuleRow = screen.getByText('All groups view').closest('tr')
    expect(allRuleRow).not.toBeNull()
    if (!allRuleRow) throw new Error('Missing all performance rule')
    await user.click(
      within(allRuleRow).getByRole('button', { name: 'Customize sources' })
    )
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({ all: ['default', 'internal', 'auto'] })
  })

  it('handles a null rules value and explains that hidden scopes stay private', () => {
    render(
      <Harness initialHiddenGroups='{"internal":true}' initialRules='null' />
    )
    expect(screen.getByText('Performance source rules')).toBeVisible()
    expect(
      screen.getByText(
        'This scope is not exposed in the marketplace; its source rule is retained but not shown publicly.'
      )
    ).toBeVisible()
  })

  it('renames scopes and removes deleted sources without restoring inherited metrics', async () => {
    render(
      <Harness initialRules='{"all":["default","ghost"],"group:default":["default","internal"]}' />
    )
    const user = userEvent.setup()
    const defaultName = screen.getByRole('textbox', {
      name: 'Group name: default',
    })
    await user.clear(defaultName)
    await user.type(defaultName, 'stable')
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({
      all: ['stable', 'ghost'],
      'group:stable': ['stable', 'internal'],
    })

    const internalPricingRow = screen
      .getByRole('textbox', { name: 'Group name: internal' })
      .closest('tr')
    expect(internalPricingRow).not.toBeNull()
    if (!internalPricingRow) throw new Error('Missing internal pricing row')
    await user.click(
      within(internalPricingRow).getByRole('button', { name: 'Delete' })
    )
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({
      all: ['stable', 'ghost'],
      'group:stable': ['stable'],
    })
  })

  it('deleting a pricing group removes its scope but preserves the global default rule', async () => {
    render(
      <Harness initialRules='{"default":["internal"],"all":["default"],"group:default":["internal"],"group:internal":["default"]}' />
    )
    const user = userEvent.setup()
    const row = screen
      .getByRole('textbox', { name: 'Group name: default' })
      .closest('tr')
    if (!row) throw new Error('Missing pricing group row')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(
      JSON.parse(
        screen.getByLabelText('Saved performance rules').textContent ?? '{}'
      )
    ).toEqual({ default: ['internal'], all: [], 'group:internal': [] })
    expect(
      screen.queryByRole('combobox', {
        name: 'Performance sources for default',
      })
    ).not.toBeInTheDocument()
  })

  it('save migration preserves explicit source priority and empty lists while pruning orphan scopes, sources and auto entries', () => {
    const values = {
      ...validGroupFormValues,
      GroupRatio: '{"public":1,"internal":0}',
      HiddenGroups: '{"internal":true}',
      PerformanceGroupMapping: '{"internal":"public"}',
      PerformanceRules:
        '{"group:removed":[],"group:public":[],"default":["internal","removed"],"all":["removed"]}',
      PerformanceFallbacks:
        '{"default":true,"group:public":false,"group:removed":true}',
      AutoGroups: '["removed","public"]',
    }
    const result = normalizeGroupPerformanceConfig(values)
    expect(JSON.parse(result.PerformanceRules)).toEqual({
      'group:public': [],
      default: ['internal'],
      all: [],
    })
    expect(JSON.parse(result.PerformanceFallbacks)).toEqual({
      default: true,
      'group:public': false,
    })
    expect(JSON.parse(result.AutoGroups)).toEqual(['public'])
    expect(values.PerformanceGroupMapping).toBe('{"internal":"public"}')
    expect(normalizeGroupPerformanceConfig({ ...values, ...result })).toEqual(
      result
    )
  })

  it('save migration imports only valid legacy merges without restoring hidden, missing or chained targets', () => {
    const values = {
      ...validGroupFormValues,
      GroupRatio: '{"public":1,"internal":0,"other":1}',
      HiddenGroups: '{"internal":true}',
      PerformanceGroupMapping: '{"internal":"public","other":"removed"}',
    }
    expect(
      JSON.parse(normalizeGroupPerformanceConfig(values).PerformanceRules)
    ).toEqual({ 'group:public': ['public', 'internal'] })
    expect(
      JSON.parse(
        normalizeGroupPerformanceConfig({
          ...values,
          PerformanceRules: '{"default":[]}',
          PerformanceGroupMapping: '{"internal":"public","public":"other"}',
        }).PerformanceRules
      )
    ).toEqual({ default: [] })
  })

  it('saving the actual form sends migrated sources and clears stale auto groups', async () => {
    const onSave = vi
      .fn<(values: typeof validGroupFormValues) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<GroupFormHarness onSave={onSave} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Save group ratios' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saved = onSave.mock.calls[0]?.[0]
    if (!saved) throw new Error('Missing saved settings')
    expect(JSON.parse(saved.PerformanceRules)).toEqual({
      'group:default': ['default', 'internal'],
    })
    expect(JSON.parse(saved.AutoGroups)).toEqual([])
    expect(saved.GroupRatio).toBe('{"default":1,"internal":0}')
  })

  it('does not overwrite newer edits when a settings save finishes', async () => {
    let finishSave: () => void = () => {
      throw new Error('Save not initialized')
    }
    const pending = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    render(<GroupFormHarness onSave={() => pending} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save group ratios' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Form save state')).toHaveTextContent(
        'saving'
      )
    )
    const row = screen
      .getByRole('textbox', { name: 'Group name: default' })
      .closest('tr')
    if (!row) throw new Error('Missing pricing row')
    const description = within(row).getByPlaceholderText('Group description')
    await user.clear(description)
    await user.type(description, 'New draft')
    await act(async () => {
      finishSave()
      await pending
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Form save state')).toHaveTextContent('idle')
    )
    const updatedRow = screen
      .getByRole('textbox', { name: 'Group name: default' })
      .closest('tr')
    if (!updatedRow) throw new Error('Missing updated pricing row')
    expect(
      within(updatedRow).getByPlaceholderText('Group description')
    ).toHaveValue('New draft')
  })
})
