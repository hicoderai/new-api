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
import { expect, test } from 'vitest'

import { resolveChatUrl } from '@/features/chat/lib/chat-links'

import { formatApiKey } from '../api-key'

test.each([
  ['', ''],
  ['  ', ''],
  ['test-only-secret', 'hicoder-test-only-secret'],
  ['hicoder-test-only-secret', 'hicoder-test-only-secret'],
  ['sk-legacy-test-secret', 'sk-legacy-test-secret'],
  ['  hicoder-test-only-secret  ', 'hicoder-test-only-secret'],
])('formats %j as %j without adding a second prefix', (key, expected) => {
  expect(formatApiKey(key)).toBe(expected)
})

test.each(['hicoder-test-only-secret', 'sk-legacy-test-secret'])(
  'chat links preserve the complete %s credential',
  (apiKey) => {
    const result = resolveChatUrl({
      template: 'https://example.com/chat?key={key}',
      apiKey,
      serverAddress: 'https://example.com',
    })
    expect(result).toContain(apiKey)
    expect(result).not.toContain(`sk-${apiKey}`)
    expect(result).not.toContain(`hicoder-${apiKey}`)
  }
)
