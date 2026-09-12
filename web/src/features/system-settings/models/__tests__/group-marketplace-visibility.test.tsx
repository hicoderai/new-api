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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { GroupRatioVisualEditor } from '../group-ratio-visual-editor'

function Harness(props: { initialHiddenGroups?: string }) {
  const [hiddenGroups, setHiddenGroups] = useState(
    props.initialHiddenGroups ?? '{}'
  )
  return (
    <>
      <GroupRatioVisualEditor
        groupRatio='{"default":1,"internal":0}'
        topupGroupRatio='{}'
        userUsableGroups='{"default":"Default","internal":"Internal"}'
        groupGroupRatio='{}'
        autoGroups='[]'
        maxTokenAutoGroupsField={null}
        groupSpecialUsableGroup='{}'
        hiddenGroups={hiddenGroups}
        onChange={(field, value) => {
          if (field === 'HiddenGroups') setHiddenGroups(value)
        }}
      />
      <output aria-label='Saved hidden groups'>{hiddenGroups}</output>
    </>
  )
}

describe('group marketplace visibility', () => {
  it('keeps editable pricing columns readable when the hidden-group column is present', () => {
    render(<Harness />)
    expect(screen.getByRole('table')).toHaveClass('min-w-[60rem]')
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
})
