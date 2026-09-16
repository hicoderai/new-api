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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useUpdateOption } from '../use-update-option'

function UpdateOptionButton(props: { optionKey: string }) {
  const updateOption = useUpdateOption()
  return (
    <button
      type='button'
      onClick={() => updateOption.mutate({ key: props.optionKey, value: '{}' })}
    >
      Save description
    </button>
  )
}

afterEach(() => vi.restoreAllMocks())

it.each([
  'UserUsableGroups',
  'group_ratio_setting.group_special_usable_group',
  'group_ratio_setting.performance_fallbacks',
])(
  'invalidates cached pricing after saving %s descriptions',
  async (optionKey) => {
    vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    client.setQueryData(['pricing'], { usable_group: { default: 'Old' } })

    render(
      <QueryClientProvider client={client}>
        <UpdateOptionButton optionKey={optionKey} />
      </QueryClientProvider>
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save description' })
    )

    await waitFor(() =>
      expect(client.getQueryState(['pricing'])?.isInvalidated).toBe(true)
    )
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: optionKey,
      value: '{}',
    })
    client.clear()
  }
)
