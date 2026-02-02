/**
 * SDKSessionManager - Manages Claude Agent SDK sessions for Vibecraft
 *
 * This module provides an alternative backend to tmux, using the Anthropic
 * Claude Agent SDK to run Claude sessions directly via the API.
 */

import { query, type Query, type Options, type HookEvent, type HookCallbackMatcher, type SDKMessage, type HookInput, type PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import type { ClaudeEvent, SDKSessionOptions } from '../shared/types.js'

// Type definitions for specific hook inputs
type PreToolUseHookInput = {
  hook_event_name: 'PreToolUse'
  tool_name: string
  tool_input: unknown
  tool_use_id: string
  session_id: string
  transcript_path: string
  cwd: string
}

type PostToolUseHookInput = {
  hook_event_name: 'PostToolUse'
  tool_name: string
  tool_input: unknown
  tool_response: unknown
  tool_use_id: string
  session_id: string
  transcript_path: string
  cwd: string
}

type StopHookInput = {
  hook_event_name: 'Stop'
  stop_hook_active: boolean
  session_id: string
  transcript_path: string
  cwd: string
}

type NotificationHookInput = {
  hook_event_name: 'Notification'
  message: string
  notification_type: string
  session_id: string
  transcript_path: string
  cwd: string
}

type SubagentStartHookInput = {
  hook_event_name: 'SubagentStart'
  agent_id: string
  agent_type: string
  session_id: string
  transcript_path: string
  cwd: string
}

type SubagentStopHookInput = {
  hook_event_name: 'SubagentStop'
  stop_hook_active: boolean
  agent_id: string
  agent_transcript_path: string
  session_id: string
  transcript_path: string
  cwd: string
}

/** SDK-specific permission mode type matching the shared types */
type SDKPermissionModeOption = 'default' | 'acceptEdits' | 'bypassPermissions'

/** Permission request hook input type */
type PermissionRequestHookInput = {
  hook_event_name: 'PermissionRequest'
  tool_name: string
  tool_input: unknown
  permission_suggestions?: unknown[]
  session_id: string
  transcript_path: string
  cwd: string
}

/** Active SDK session with its Query instance */
interface ActiveSDKSession {
  /** Query instance for sending prompts and controlling the session */
  query: Query
  /** Abort controller for cancellation */
  abortController: AbortController
  /** Working directory */
  cwd: string
  /** Model used */
  model: 'sonnet' | 'opus' | 'haiku'
  /** Running cost in USD */
  costUsd: number
  /** Last activity timestamp */
  lastActivity: number
  /** Whether the session is currently processing */
  isProcessing: boolean
  /** Message queue for multi-turn conversations */
  messageIterator: AsyncIterator<SDKMessage> | null
  /** Last response text captured from result message */
  lastResponse: string | null
  /** Permission mode for this session */
  permissionMode: SDKPermissionModeOption
  /** Claude Agent SDK's actual session ID for resumption */
  sdkResumeId: string | null
}

/** Callback for emitting events to Vibecraft */
type EventCallback = (event: ClaudeEvent) => void

/** Callback for notifying when SDK session ID is captured */
type SessionIdUpdateCallback = (managedId: string, sdkResumeId: string) => void

/** Logger interface */
interface Logger {
  log: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/**
 * Manages SDK sessions for Vibecraft
 */
export class SDKSessionManager {
  /** Active SDK sessions indexed by managed session ID */
  private sessions = new Map<string, ActiveSDKSession>()

  /** Callback to emit events */
  private emitEvent: EventCallback

  /** Callback to notify when session ID is captured */
  private onSessionIdUpdate: SessionIdUpdateCallback | null = null

  /** Logger */
  private logger: Logger

  constructor(emitEvent: EventCallback, logger?: Logger) {
    this.emitEvent = emitEvent
    this.logger = logger ?? {
      log: (...args) => console.log('[SDKSessionManager]', ...args),
      debug: () => {}, // No-op by default
    }
  }

  /**
   * Set callback for session ID updates (called when SDK session ID is captured)
   */
  setSessionIdUpdateCallback(callback: SessionIdUpdateCallback): void {
    this.onSessionIdUpdate = callback
  }

  /**
   * Check if ANTHROPIC_API_KEY is configured
   */
  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
  }

  /**
   * Create a new SDK session
   */
  async createSession(
    managedId: string,
    options: SDKSessionOptions,
    cwd: string
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }

    const sessionId = randomUUID()
    const model = options.model ?? 'sonnet'
    const permissionMode: PermissionMode = this.mapPermissionMode(options.permissionMode ?? 'bypassPermissions')

    this.logger.log(`Creating SDK session: ${managedId} (model: ${model}, cwd: ${cwd})`)

    const abortController = new AbortController()

    // Build hooks for event emission
    const hooks = this.buildHooks(managedId, sessionId, cwd)

    const queryOptions: Options = {
      abortController,
      cwd,
      permissionMode,
      hooks,
    }

    // We don't start the query yet - that happens when sendPrompt is called
    // For now, just register the session
    this.sessions.set(managedId, {
      query: null as unknown as Query, // Will be set on first prompt
      abortController,
      cwd,
      model,
      costUsd: 0,
      lastActivity: Date.now(),
      isProcessing: false,
      messageIterator: null,
      lastResponse: null,
      permissionMode: options.permissionMode ?? 'bypassPermissions',
      sdkResumeId: options.resume ?? null, // Use provided resume ID or null for new sessions
    })

    return sessionId
  }

  /**
   * Map our permission mode to SDK permission mode
   */
  private mapPermissionMode(mode: SDKPermissionModeOption): PermissionMode {
    switch (mode) {
      case 'default':
        return 'default'
      case 'acceptEdits':
        return 'acceptEdits'
      case 'bypassPermissions':
        return 'bypassPermissions'
      default:
        return 'bypassPermissions'
    }
  }

  /**
   * Build hooks configuration for event emission
   */
  private buildHooks(
    managedId: string,
    sessionId: string,
    cwd: string
  ): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const emitEvent = this.emitEvent
    const logger = this.logger

    const createEventBase = () => ({
      id: randomUUID(),
      timestamp: Date.now(),
      sessionId,
      cwd,
    })

    return {
      PreToolUse: [{
        hooks: [async (input: HookInput) => {
          const hook = input as PreToolUseHookInput
          logger.debug('PreToolUse hook:', hook.tool_name)

          const event: ClaudeEvent = {
            ...createEventBase(),
            type: 'pre_tool_use',
            tool: hook.tool_name,
            toolInput: hook.tool_input as Record<string, unknown>,
            toolUseId: hook.tool_use_id,
          }
          emitEvent(event)

          return { continue: true }
        }],
      }],

      PostToolUse: [{
        hooks: [async (input: HookInput) => {
          const hook = input as PostToolUseHookInput
          logger.debug('PostToolUse hook:', hook.tool_name)

          const event: ClaudeEvent = {
            ...createEventBase(),
            type: 'post_tool_use',
            tool: hook.tool_name,
            toolInput: hook.tool_input as Record<string, unknown>,
            toolResponse: hook.tool_response as Record<string, unknown>,
            toolUseId: hook.tool_use_id,
            success: true, // SDK hooks don't provide success flag directly
          }
          emitEvent(event)

          return { continue: true }
        }],
      }],

      Stop: [{
        hooks: [async (input: HookInput) => {
          const hook = input as StopHookInput
          logger.debug('Stop hook fired (stopHookActive:', hook.stop_hook_active, ')')

          // NOTE: We do NOT emit the stop event here because the Stop hook fires
          // BEFORE the 'result' message arrives in the query stream. The actual
          // stop event with the response text is emitted in handleSDKMessage()
          // when we receive the 'result' message.

          // Mark session as not processing
          const session = this.sessions.get(managedId)
          if (session) {
            session.isProcessing = false
            session.lastActivity = Date.now()
            // Don't clear lastResponse here - handleSDKMessage may not have run yet
          }

          return { continue: true }
        }],
      }],

      Notification: [{
        hooks: [async (input: HookInput) => {
          const hook = input as NotificationHookInput
          logger.debug('Notification hook:', hook.message)

          const event: ClaudeEvent = {
            ...createEventBase(),
            type: 'notification',
            message: hook.message,
            notificationType: hook.notification_type,
          }
          emitEvent(event)

          return { continue: true }
        }],
      }],

      SubagentStart: [{
        hooks: [async (input: HookInput) => {
          const hook = input as SubagentStartHookInput
          logger.debug('SubagentStart hook:', hook.agent_type)
          // We could emit a custom event here for subagent tracking
          // For now, just continue
          return { continue: true }
        }],
      }],

      SubagentStop: [{
        hooks: [async (input: HookInput) => {
          const hook = input as SubagentStopHookInput
          logger.debug('SubagentStop hook')

          const event: ClaudeEvent = {
            ...createEventBase(),
            type: 'subagent_stop',
            stopHookActive: hook.stop_hook_active,
          }
          emitEvent(event)

          return { continue: true }
        }],
      }],

      UserPromptSubmit: [{
        hooks: [async (_input: HookInput) => {
          logger.debug('UserPromptSubmit hook')
          // Don't emit user_prompt_submit here - we emit it when sendPrompt is called
          // to ensure proper timing
          return { continue: true }
        }],
      }],

      PermissionRequest: [{
        hooks: [async (input: HookInput) => {
          const hook = input as PermissionRequestHookInput
          logger.debug('PermissionRequest hook:', hook.tool_name)

          // Emit a permission_request event that the frontend can handle
          const event: ClaudeEvent = {
            ...createEventBase(),
            type: 'notification',
            message: `Permission required for ${hook.tool_name}`,
            notificationType: 'permission_request',
            // Include tool details for the frontend
            toolName: hook.tool_name,
            toolInput: hook.tool_input,
          } as ClaudeEvent

          emitEvent(event)

          return { continue: true }
        }],
      }],
    }
  }

  /**
   * Send a prompt to an SDK session
   */
  async sendPrompt(managedId: string, prompt: string): Promise<void> {
    const session = this.sessions.get(managedId)
    if (!session) {
      throw new Error(`SDK session not found: ${managedId}`)
    }

    if (session.isProcessing) {
      this.logger.log(`Session ${managedId} is already processing, queueing prompt`)
      // In a more sophisticated implementation, we could queue prompts
      // For now, just warn
    }

    session.lastActivity = Date.now()
    session.isProcessing = true

    // Emit user_prompt_submit event
    const sessionId = this.getSessionId(managedId)
    this.emitEvent({
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'user_prompt_submit',
      sessionId,
      cwd: session.cwd,
      prompt,
    })

    try {
      // Build hooks for this query
      const hooks = this.buildHooks(managedId, sessionId, session.cwd)

      const queryOptions: Options = {
        abortController: session.abortController,
        cwd: session.cwd,
        permissionMode: this.mapPermissionMode(session.permissionMode),
        hooks,
        // Use resume option if we have a previous session ID (enables multi-turn conversations)
        resume: session.sdkResumeId ?? undefined,
      }

      // Log whether we're resuming or starting fresh
      if (session.sdkResumeId) {
        this.logger.log(`Resuming session ${managedId} with SDK session ID: ${session.sdkResumeId}`)
      } else {
        this.logger.log(`Starting new session for ${managedId} (no previous SDK session ID)`)
      }

      // Create the query
      const q = query({
        prompt,
        options: queryOptions,
      })

      // Store the query instance
      session.query = q

      this.logger.log(`Starting query for session ${managedId}`)

      // Process the query stream
      for await (const message of q) {
        this.handleSDKMessage(managedId, message)
      }

      this.logger.log(`Query completed for session ${managedId}`)
    } catch (error) {
      this.logger.log(`Query error for session ${managedId}:`, error)

      // Emit error notification
      this.emitEvent({
        id: randomUUID(),
        timestamp: Date.now(),
        type: 'notification',
        sessionId,
        cwd: session.cwd,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        notificationType: 'error',
      })
    } finally {
      session.isProcessing = false
      session.lastActivity = Date.now()
    }
  }

  /**
   * Handle SDK message from the query stream
   */
  private handleSDKMessage(managedId: string, message: SDKMessage): void {
    const session = this.sessions.get(managedId)
    if (!session) return

    // Capture SDK session ID from 'system' init message
    // This is the actual session ID that can be used to resume the session later
    if (message.type === 'system') {
      interface SDKSystemMessage {
        type: 'system'
        subtype?: 'init' | string
        session_id?: string
      }
      const systemMsg = message as SDKSystemMessage
      if (systemMsg.subtype === 'init' && systemMsg.session_id) {
        // Only capture if we don't already have a resume ID (first prompt establishes the session)
        if (!session.sdkResumeId) {
          session.sdkResumeId = systemMsg.session_id
          this.logger.log(`Captured SDK session ID for ${managedId}: ${systemMsg.session_id}`)

          // Notify server to persist this session ID
          if (this.onSessionIdUpdate) {
            this.onSessionIdUpdate(managedId, systemMsg.session_id)
          }
        }
      }
    }

    // Track usage/cost and capture response if available
    if (message.type === 'result') {
      // Type for the result message with all its fields
      interface SDKResultMessage {
        type: 'result'
        subtype?: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries'
        result?: string
        session_id?: string
        total_cost_usd?: number
        usage?: { total_cost_usd?: number }
      }

      const result = message as SDKResultMessage
      const sessionId = this.getSessionId(managedId)

      // Capture the response text if present
      if (result.result) {
        session.lastResponse = result.result
        this.logger.debug(`Captured response for ${managedId}: ${result.result.slice(0, 100)}...`)
      }

      // Emit a stop event with the response NOW, since the Stop hook fires
      // BEFORE the 'result' message arrives in the query stream (timing issue).
      // We emit regardless of whether there's a response (error cases have no result).
      this.emitEvent({
        id: randomUUID(),
        timestamp: Date.now(),
        type: 'stop',
        sessionId,
        cwd: session.cwd,
        stopHookActive: false,
        response: result.result, // May be undefined for error subtypes
      })
      this.logger.debug(`Emitted stop event for ${managedId} (has response: ${!!result.result})`)

      // Clear lastResponse for next prompt
      session.lastResponse = null

      // Update cost
      const cost = result.total_cost_usd ?? result.usage?.total_cost_usd
      if (cost) {
        session.costUsd += cost
        this.logger.debug(`Updated cost for ${managedId}: $${session.costUsd.toFixed(6)}`)
      }
    }

    // Other message types could be logged or processed as needed
    this.logger.debug(`SDK message (${message.type}) for ${managedId}`)
  }

  /**
   * Interrupt an SDK session
   */
  async interrupt(managedId: string): Promise<void> {
    const session = this.sessions.get(managedId)
    if (!session) {
      throw new Error(`SDK session not found: ${managedId}`)
    }

    this.logger.log(`Interrupting session ${managedId}`)

    try {
      if (session.query) {
        await session.query.interrupt()
      }
    } catch (error) {
      this.logger.log(`Interrupt error for ${managedId}:`, error)
    }

    session.isProcessing = false
    session.lastActivity = Date.now()
  }

  /**
   * Stop and clean up an SDK session
   */
  async stopSession(managedId: string): Promise<void> {
    const session = this.sessions.get(managedId)
    if (!session) {
      return // Already stopped
    }

    this.logger.log(`Stopping session ${managedId}`)

    try {
      // Abort the controller to cancel any pending operations
      session.abortController.abort()
    } catch (error) {
      this.logger.debug(`Abort error for ${managedId}:`, error)
    }

    this.sessions.delete(managedId)
  }

  /**
   * Restore an SDK session from persisted data (for server restart recovery)
   * This re-creates the in-memory session state so that the next sendPrompt
   * call will resume the previous conversation using the stored session ID.
   */
  restoreSession(
    managedId: string,
    sdkResumeId: string,
    options: SDKSessionOptions,
    cwd: string,
    costUsd: number = 0
  ): void {
    if (!this.isConfigured()) {
      this.logger.log(`Cannot restore session ${managedId}: ANTHROPIC_API_KEY not configured`)
      return
    }

    // Don't restore if session already exists
    if (this.sessions.has(managedId)) {
      this.logger.log(`Session ${managedId} already exists, skipping restore`)
      return
    }

    this.logger.log(`Restoring SDK session ${managedId} with resume ID: ${sdkResumeId}`)

    const model = options.model ?? 'sonnet'
    const abortController = new AbortController()

    this.sessions.set(managedId, {
      query: null as unknown as Query, // Will be set on first prompt
      abortController,
      cwd,
      model,
      costUsd,
      lastActivity: Date.now(),
      isProcessing: false,
      messageIterator: null,
      lastResponse: null,
      permissionMode: options.permissionMode ?? 'bypassPermissions',
      sdkResumeId, // The key part: restore the SDK session ID for resumption
    })

    this.logger.log(`Restored SDK session ${managedId} (model: ${model}, cost: $${costUsd.toFixed(4)})`)
  }

  /**
   * Get the Claude session ID for a managed session
   * For SDK sessions, we generate a unique ID
   */
  private getSessionId(managedId: string): string {
    // Use managed ID as the session ID for SDK sessions
    // This ensures events are properly linked
    return `sdk-${managedId}`
  }

  /**
   * Get session info
   */
  getSession(managedId: string): ActiveSDKSession | undefined {
    return this.sessions.get(managedId)
  }

  /**
   * Get cost for a session
   */
  getCost(managedId: string): number {
    return this.sessions.get(managedId)?.costUsd ?? 0
  }

  /**
   * Get the SDK resume ID for a session (for persistence)
   */
  getResumeId(managedId: string): string | null {
    return this.sessions.get(managedId)?.sdkResumeId ?? null
  }

  /**
   * Check if a session is processing
   */
  isProcessing(managedId: string): boolean {
    return this.sessions.get(managedId)?.isProcessing ?? false
  }

  /**
   * Check if a session exists
   */
  hasSession(managedId: string): boolean {
    return this.sessions.has(managedId)
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }
}
