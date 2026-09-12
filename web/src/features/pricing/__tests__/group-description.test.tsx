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
import { describe, expect, it } from 'vitest'

import { GroupDescription } from '../components/group-description'

const usableGroup = {
  stable: 'First line 🌟\nSecond line',
  premium: '   ',
  rich: '<b>Plain text</b> 🚀',
  auto: 'Internal automatic group',
  all: 'Must not appear without a filter',
}
const availableGroups = ['stable', 'premium', 'rich', 'all']

describe('pricing group description', () => {
  it('updates multiline plain text immediately when the selected group changes or resets', () => {
    const view = render(
      <GroupDescription
        selectedGroup='stable'
        availableGroups={availableGroups}
        usableGroup={usableGroup}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'First line 🌟 Second line'
    )

    view.rerender(
      <GroupDescription
        selectedGroup='rich'
        availableGroups={availableGroups}
        usableGroup={usableGroup}
      />
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('<b>Plain text</b> 🚀')
    expect(alert.querySelector('b')).toBeNull()

    view.rerender(
      <GroupDescription
        selectedGroup='all'
        availableGroups={availableGroups}
        usableGroup={usableGroup}
      />
    )
    expect(screen.queryByText('Group description')).not.toBeInTheDocument()
  })

  it.each(['premium', 'ghost', 'auto'])(
    'does not show a description for blank, invalid, or excluded group %s',
    (selectedGroup) => {
      render(
        <GroupDescription
          selectedGroup={selectedGroup}
          availableGroups={availableGroups}
          usableGroup={usableGroup}
        />
      )
      expect(screen.queryByText('Group description')).not.toBeInTheDocument()
    }
  )
})
