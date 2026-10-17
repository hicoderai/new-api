import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { createEmailSchema } from '../email-settings-schema'
import { EmailSettingsSection } from '../email-settings-section'

type EmailValues = ComponentProps<typeof EmailSettingsSection>['defaultValues']
const defaults: EmailValues = {
  EmailProvider: 'smtp',
  ResendApiKey: '',
  ResendFrom: 'notify@example.com',
  SMTPServer: 'smtp.example.com',
  SMTPPort: '587',
  SMTPAccount: 'sender@example.com',
  SMTPFrom: 'sender@example.com',
  SMTPToken: '',
  SMTPSSLEnabled: false,
  SMTPStartTLSEnabled: true,
  SMTPInsecureSkipVerify: false,
  SMTPForceAuthLogin: false,
}

function EmailFixture(props: { values: EmailValues }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return (
    <SettingsPageProvider actionsContainer={actions}>
      <div ref={setActions} />
      <EmailSettingsSection defaultValues={props.values} />
    </SettingsPageProvider>
  )
}
function renderEmail(values: Partial<EmailValues> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <EmailFixture values={{ ...defaults, ...values }} />
    </QueryClientProvider>
  )
  return userEvent.setup()
}
afterEach(() => vi.restoreAllMocks())

describe('email delivery settings', () => {
  it('selects only one provider, hides inactive fields and retains SMTP drafts when switching back', async () => {
    const request = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = renderEmail()
    const host = screen.getByRole('textbox', { name: 'SMTP Host' })
    await user.clear(host)
    await user.type(host, 'draft.smtp.example.com')
    await user.click(screen.getByRole('radio', { name: 'Resend API' }))
    expect(screen.getByRole('radio', { name: 'Resend API' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'SMTP' })).not.toBeChecked()
    expect(
      screen.queryByRole('textbox', { name: 'SMTP Host' })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Resend API key')).toHaveAttribute(
      'type',
      'password'
    )
    await user.click(screen.getByRole('radio', { name: 'SMTP' }))
    expect(screen.getByRole('textbox', { name: 'SMTP Host' })).toHaveValue(
      'draft.smtp.example.com'
    )
    expect(screen.queryByLabelText('Resend API key')).not.toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('saves Resend credentials before activating it and ignores invalid inactive SMTP fields', async () => {
    const request = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = renderEmail({ SMTPPort: 'invalid', SMTPFrom: 'invalid' })
    await user.click(screen.getByRole('radio', { name: 'Resend API' }))
    const from = screen.getByRole('textbox', { name: 'Resend sender' })
    await user.clear(from)
    await user.type(from, 'HiCoder <mail@example.com>')
    await user.type(screen.getByLabelText('Resend API key'), 'test-key')
    await user.click(
      screen.getByRole('button', { name: 'Save email settings' })
    )
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3))
    expect(request.mock.calls.map((call) => call[1])).toEqual([
      { key: 'ResendFrom', value: 'HiCoder <mail@example.com>' },
      { key: 'ResendApiKey', value: 'test-key' },
      { key: 'EmailProvider', value: 'resend' },
    ])
    await waitFor(() =>
      expect(screen.getByLabelText('Resend API key')).toHaveValue('')
    )
  })

  it('keeps a saved Resend key when its input is blank', async () => {
    const request = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = renderEmail({ EmailProvider: 'resend' })
    const from = screen.getByRole('textbox', { name: 'Resend sender' })
    await user.clear(from)
    await user.type(from, 'changed@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Save email settings' })
    )
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledWith('/api/option/', {
      key: 'ResendFrom',
      value: 'changed@example.com',
    })
  })

  it('switches back to SMTP without clearing or updating Resend credentials', async () => {
    const request = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = renderEmail({ EmailProvider: 'resend' })
    await user.click(screen.getByRole('radio', { name: 'SMTP' }))
    await user.click(
      screen.getByRole('button', { name: 'Save email settings' })
    )
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledWith('/api/option/', {
      key: 'EmailProvider',
      value: 'smtp',
    })
  })

  it('does not activate Resend if saving its credential fails', async () => {
    const request = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: false, message: 'Credential save rejected' },
    })
    const user = renderEmail()
    await user.click(screen.getByRole('radio', { name: 'Resend API' }))
    await user.type(screen.getByLabelText('Resend API key'), 'test-key')
    await user.click(
      screen.getByRole('button', { name: 'Save email settings' })
    )
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save email settings' })
      ).toBeEnabled()
    )
    expect(request.mock.calls.map((call) => call[1])).toEqual([
      { key: 'ResendApiKey', value: 'test-key' },
    ])
  })

  it('rejects an empty Resend sender without submitting settings', async () => {
    const request = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = renderEmail({ EmailProvider: 'resend', ResendFrom: '' })
    await user.click(
      screen.getByRole('button', { name: 'Save email settings' })
    )
    expect(
      await screen.findByText('Enter a valid sender email address')
    ).toBeVisible()
    expect(request).not.toHaveBeenCalled()
  })

  it('supports changing the provider with the keyboard', async () => {
    const user = renderEmail()
    await user.click(screen.getByRole('radio', { name: 'SMTP' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Resend API' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Resend sender' })).toBeVisible()
  })

  it('validates provider values on the form boundary', () => {
    expect(
      createEmailSchema((key) => key).safeParse({
        ...defaults,
        EmailProvider: 'both',
      }).success
    ).toBe(false)
  })
})
