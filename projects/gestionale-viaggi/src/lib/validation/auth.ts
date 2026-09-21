import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Inserisci l’indirizzo email')
  .email('Indirizzo email non valido')
  .transform((value) => value.toLowerCase())

export const passwordSchema = z
  .string()
  .min(10, 'La password deve avere almeno 10 caratteri')
  .max(128, 'La password è troppo lunga')
  .refine((value) => /[a-z]/.test(value), 'Serve almeno una lettera minuscola')
  .refine((value) => /[A-Z]/.test(value), 'Serve almeno una lettera maiuscola')
  .refine((value) => /[0-9]/.test(value), 'Serve almeno un numero')

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Inserisci la password'),
  successivo: z.string().optional(),
})

export const magicLinkSchema = z.object({
  email: emailSchema,
  successivo: z.string().optional(),
})

export const resetRequestSchema = z.object({
  email: emailSchema,
})

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    conferma: z.string(),
  })
  .refine((data) => data.password === data.conferma, {
    message: 'Le due password non coincidono',
    path: ['conferma'],
  })

export const signUpSchema = z
  .object({
    agencyName: z
      .string()
      .trim()
      .min(2, 'Il nome dell’agenzia è obbligatorio')
      .max(120, 'Il nome dell’agenzia è troppo lungo'),
    fullName: z
      .string()
      .trim()
      .min(2, 'Inserisci nome e cognome')
      .max(120, 'Nomè troppo lungo'),
    vatNumber: z
      .string()
      .trim()
      .regex(/^(IT)?\d{11}$/, 'Partita IVA non valida (11 cifre)')
      .optional()
      .or(z.literal('')),
    email: emailSchema,
    password: passwordSchema,
  })

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
