import * as z from 'zod'

export const createEmailSchema = (t: (key: string) => string) =>
  z
    .object({
      EmailProvider: z.enum(['smtp', 'resend']),
      ResendApiKey: z.string(),
      ResendFrom: z.string(),
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
        const named = from.match(/^[^<>\r\n]+<([^<>]+)>$/)
        const email = named ? named[1].trim() : from
        if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
          context.addIssue({
            code: 'custom',
            path: ['ResendFrom'],
            message: t('Enter a valid sender email address'),
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
