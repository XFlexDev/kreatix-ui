import { z } from 'zod'

import { licenses, frameworks, categories } from './constants'
export { licenses, frameworks, categories } from './constants'
const httpsUrl = z.string().max(500).refine(value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) } catch { return false }
}, 'Enter a public HTTPS URL')
export const previewInputSchema = z.object({
  previewMode: z.enum(['html', 'react', 'link']), code: z.string().max(80_000).default(''),
  css: z.string().max(30_000).default(''), js: z.string().max(30_000).default(''),
}).strict()
export const draftSchema = z.object({
  title: z.string().trim().max(80).default(''),
  description: z.string().trim().max(2000).default(''),
  kind: z.enum(['component', 'library']),
  framework: z.enum(frameworks),
  category: z.enum(categories),
  license: z.enum(licenses),
  sourceUrl: z.union([httpsUrl, z.literal('')]).default(''),
  demoUrl: z.union([httpsUrl, z.literal('')]).default(''),
  install: z.string().max(300).default(''),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  previewMode: z.enum(['html', 'react', 'link']),
  code: z.string().max(80_000).default(''),
  css: z.string().max(30_000).default(''),
  js: z.string().max(30_000).default(''),
  freeOnly: z.boolean().default(false),
  attribution: z.string().trim().max(500).default(''),
}).strict()
export type DraftInput = z.infer<typeof draftSchema>
export const submissionSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(2000),
  kind: z.enum(['component', 'library']),
  framework: z.enum(frameworks),
  category: z.enum(categories),
  license: z.enum(licenses),
  sourceUrl: httpsUrl,
  demoUrl: z.union([httpsUrl, z.literal('')]).default(''),
  install: z.string().max(300).default(''),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  previewMode: z.enum(['html', 'react', 'link']),
  code: z.string().max(80_000).default(''),
  css: z.string().max(30_000).default(''),
  js: z.string().max(30_000).default(''),
  freeOnly: z.literal(true, { error: 'Confirm that the full advertised functionality is free and open-source' }),
  attribution: z.string().trim().max(500).default(''),
}).strict().superRefine((s, ctx) => {
  if (s.previewMode !== 'link' && !s.code.trim()) ctx.addIssue({ code: 'custom', path: ['code'], message: 'Add preview code or choose a demo link' })
  if (s.previewMode === 'link' && !s.demoUrl) ctx.addIssue({ code: 'custom', path: ['demoUrl'], message: 'Add a demo URL for the external preview' })
  if (s.previewMode === 'react' && s.framework !== 'React') ctx.addIssue({ code: 'custom', path: ['framework'], message: 'React previews require the React framework' })
})
export type SubmissionInput = z.infer<typeof submissionSchema>
export type Creator = { id: string; username: string; name: string; bio: string; website: string; curated: boolean; joined: string }
export type User = { id: string; username: string; name: string; role: 'member' | 'admin' }
export type Submission = DraftInput & { id: string; slug: string; status: 'draft' | 'pending' | 'approved' | 'rejected'; reason: string; creator: Creator; createdAt: string; updatedAt: string; saves: number; saved: boolean; curated: boolean; ownerId: string | null; published?: boolean }
export type Comment = { id: string; body: string; createdAt: string; author: Creator }
