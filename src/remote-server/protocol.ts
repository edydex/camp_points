import { z } from 'zod'

import {
  ShowCommandSchema,
  type CommandResult,
  type EngineSnapshot,
} from '../shared'

export const PairMessageSchema = z.object({
  type: z.literal('pair'),
  pin: z.string().regex(/^\d{6}$/).optional(),
  clientId: z.string().min(8).max(128),
  clientLabel: z.string().trim().min(1).max(80).optional(),
  sessionToken: z.string().min(32).max(256).optional(),
  replace: z.boolean().optional().default(false),
})

export const CommandMessageSchema = z.object({
  type: z.literal('command'),
  id: z.string().min(8).max(128),
  command: ShowCommandSchema,
})

export const ClientMessageSchema = z.discriminatedUnion('type', [
  PairMessageSchema,
  CommandMessageSchema,
  z.object({ type: z.literal('snapshot.request') }),
  z.object({ type: z.literal('ping'), at: z.number().optional() }),
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>

export type ServerMessage =
  | {
      type: 'hello'
      pairingRequired: true
      pairingExpiresAt: string
      serverVersion: 1
    }
  | {
      type: 'paired'
      clientId: string
      sessionToken: string
      snapshot: EngineSnapshot
    }
  | { type: 'snapshot'; snapshot: EngineSnapshot }
  | { type: 'ack'; id: string; result: CommandResult }
  | {
      type: 'error'
      code:
        | 'invalid-message'
        | 'pairing-expired'
        | 'invalid-pin'
        | 'rate-limited'
        | 'active-controller'
        | 'not-paired'
        | 'command-failed'
      message: string
      canReplace?: boolean
    }
  | { type: 'pong'; at?: number }
