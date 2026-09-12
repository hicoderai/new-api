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
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { NotFoundError } from '../not-found-error'

describe('not found page', () => {
  test('offers document links to the landing homepage and docs for console route misses', () => {
    render(<NotFoundError />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '404 NotFoundOops! Page Not Found!'
    )
    const navigation = screen.getByRole('navigation', { name: 'Quick Links' })
    expect(
      within(navigation).getByRole('link', { name: 'Back to Home' })
    ).toHaveAttribute('href', '/')
    expect(
      within(navigation).getByRole('link', { name: 'Docs' })
    ).toHaveAttribute('href', '/docs/')
  })
})
