import * as z from 'zod'

export const createEmailSchema = (t: (key: string) => string) =>
  z
    .object({
      EmailProvider: z.enum(['smtp', 'resend']),
      ResendApiKey: z.string(),
      ResendFrom: z.string(),
      ResendSenderName: z.string(),
      SMTPServer: z.string(),
      SMTPPort: z.string(),
      SMTPAccount: z.string(),
      SMTPFrom: z.string(),
      SMTPToken: z.string(),
      SMTPSSLEnabled: z.boolean(),
      SMTPStartTLSEnabled: z.boolean(),
      SMTPInsecureSkipVerify: z.boolean(),
      SMTPForceAuthLogin: z.boolean(),
    })
    .superRefine((values, context) => {
      if (values.EmailProvider === 'resend') {
        const from = values.ResendFrom.trim()
        if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
          context.addIssue({
            code: 'custom',
            path: ['ResendFrom'],
            message: t('Enter a valid sender email address'),
          })
        }
        if (/[\r\n\0]/.test(values.ResendSenderName)) {
          context.addIssue({
            code: 'custom',
            path: ['ResendSenderName'],
            message: t(
              'Sender name must not contain line breaks or null characters'
            ),
          })
        }
        return
      }
      const port = values.SMTPPort.trim()
      if (
        port &&
        (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['SMTPPort'],
          message: t('Port must be a positive integer'),
        })
      }
      const from = values.SMTPFrom.trim()
      if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
        context.addIssue({
          code: 'custom',
          path: ['SMTPFrom'],
          message: t('Enter a valid email or leave blank'),
        })
      }
    })

export type EmailFormValues = z.infer<ReturnType<typeof createEmailSchema>>

// Keep the existing ResendFrom option/API contract while editing its two parts.
export function parseResendSender(value: string) {
  const named = value.trim().match(/^(.*?)\s*<([^<>]+)>$/)
  if (!named) return { ResendFrom: value.trim(), ResendSenderName: '' }
  let name = named[1].trim()
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replaceAll(/\\(.)/g, '$1')
  }
  return { ResendFrom: named[2].trim(), ResendSenderName: name }
}
