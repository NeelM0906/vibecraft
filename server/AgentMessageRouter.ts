/**
 * AgentMessageRouter - Routes messages between agents
 *
 * This module handles the routing of inter-agent messages based on
 * direct addressing, capability-based routing, or broadcast.
 *
 * IMPORTANT: This router is SDK-first. All message delivery goes through
 * the SDK session manager for programmatic agent communication.
 */

import { randomUUID } from 'crypto'
import type {
  AgentMessageEvent,
  AgentMessageResponseEvent,
  AgentBroadcastEvent,
  AgentCapability,
  AgentMessagePriority,
  AgentMessageRouting,
  SendAgentMessageRequest,
  SendAgentMessageResponse,
  AgentRegistryEntry,
} from '../shared/types.js'
import type { AgentRegistry } from './AgentRegistry.js'

/** Logger interface */
interface Logger {
  log: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/** Callback for delivering messages to agents (SDK-first) */
type MessageDeliveryCallback = (agentId: string, message: AgentMessageEvent | AgentBroadcastEvent) => Promise<void>

/** Callback for broadcasting events to UI clients */
type EventBroadcastCallback = (event: AgentMessageEvent | AgentMessageResponseEvent | AgentBroadcastEvent) => void

/** Pending message awaiting response - stores full callback info */
interface PendingMessage {
  messageId: string
  fromAgentId: string
  fromAgentName: string
  toAgentId: string
  toAgentName: string
  sentAt: number
  timeout: number
  originalMessage: string
  /** Resolve with full response data */
  resolve: (result: SendAgentMessageResponse) => void
  /** Reject on error/timeout */
  reject: (error: Error) => void
  /** Track delivery attempts for retry logic */
  deliveryAttempts: number
  /** Track if response has been received */
  responseReceived: boolean
}

/** Retry configuration */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
}

/**
 * Routes messages between agents with robust delivery and response handling
 */
export class AgentMessageRouter {
  /** Agent registry for lookups */
  private registry: AgentRegistry

  /** Callback for delivering messages */
  private deliverMessage: MessageDeliveryCallback

  /** Callback for broadcasting events to all UI clients */
  private broadcastEvent: EventBroadcastCallback

  /** Pending messages awaiting responses */
  private pendingMessages = new Map<string, PendingMessage>()

  /** Message history for debugging (circular buffer) */
  private messageHistory: Array<AgentMessageEvent | AgentMessageResponseEvent | AgentBroadcastEvent> = []

  /** Max history size */
  private maxHistorySize = 100

  /** Logger */
  private logger: Logger

  /** Timeout checker interval */
  private timeoutChecker: NodeJS.Timeout | null = null

  constructor(
    registry: AgentRegistry,
    deliverMessage: MessageDeliveryCallback,
    broadcastEvent: EventBroadcastCallback,
    logger?: Logger
  ) {
    this.registry = registry
    this.deliverMessage = deliverMessage
    this.broadcastEvent = broadcastEvent
    this.logger = logger ?? {
      log: (...args) => console.log('[AgentMessageRouter]', ...args),
      debug: () => {},
    }

    // Start timeout checker (every 5 seconds)
    this.timeoutChecker = setInterval(() => this.checkTimeouts(), 5000)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker)
      this.timeoutChecker = null
    }
    this.clearPending()
  }

  /**
   * Send a message from one agent to another
   *
   * @param fromAgentId - The sending agent's ID
   * @param request - The message request with routing info
   * @returns Promise that resolves with the response (if expectsResponse=true)
   */
  async sendMessage(
    fromAgentId: string,
    request: SendAgentMessageRequest
  ): Promise<SendAgentMessageResponse> {
    const fromAgent = this.registry.get(fromAgentId)
    if (!fromAgent) {
      return { ok: false, error: 'Sender agent not found in registry' }
    }

    // Determine routing mode and target
    let routing: AgentMessageRouting
    let targetAgentId: string | undefined

    if (request.toAgentId) {
      // Direct routing - send to specific agent
      routing = 'direct'
      targetAgentId = request.toAgentId

      const targetAgent = this.registry.get(targetAgentId)
      if (!targetAgent) {
        return { ok: false, error: `Target agent not found: ${targetAgentId}` }
      }
      if (!targetAgent.acceptsMessages) {
        return { ok: false, error: `Target agent does not accept messages: ${targetAgentId}` }
      }
      if (targetAgent.status === 'offline') {
        return { ok: false, error: `Target agent is offline: ${targetAgentId}` }
      }
    } else if (request.toCapability) {
      // Capability-based routing - find best agent with capability
      routing = 'capability'
      const bestAgent = this.registry.findBestForCapability(request.toCapability, fromAgentId)

      if (!bestAgent) {
        return { ok: false, error: `No agent found with capability: ${request.toCapability}` }
      }
      targetAgentId = bestAgent.agentId
    } else {
      return { ok: false, error: 'Must specify either toAgentId or toCapability' }
    }

    const messageId = randomUUID()
    const targetAgent = this.registry.get(targetAgentId)!
    const timeout = request.responseTimeout ?? 300000 // 5 minutes default

    // Create the message event
    const messageEvent: AgentMessageEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'agent_message',
      sessionId: fromAgentId,
      cwd: fromAgent.cwd ?? '',
      fromAgentId,
      fromAgentName: fromAgent.name,
      toAgentId: targetAgentId,
      toCapability: request.toCapability,
      routing,
      message: request.message,
      context: request.context,
      priority: request.priority ?? 'normal',
      messageId,
      expectsResponse: request.expectsResponse ?? false,
      responseTimeout: timeout,
    }

    // Add to history
    this.addToHistory(messageEvent)

    // Broadcast the event to all UI clients (for visualization)
    this.broadcastEvent(messageEvent)

    // If expecting response, set up pending message BEFORE delivery
    // This prevents race condition where response arrives before listener is registered
    let pendingPromiseResolve: ((result: SendAgentMessageResponse) => void) | undefined
    let pendingPromiseReject: ((error: Error) => void) | undefined

    if (request.expectsResponse) {
      const pending: PendingMessage = {
        messageId,
        fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId: targetAgentId!,
        toAgentName: targetAgent.name,
        sentAt: Date.now(),
        timeout,
        originalMessage: request.message,
        deliveryAttempts: 1,
        responseReceived: false,
        resolve: (result) => {
          pending.responseReceived = true
          this.pendingMessages.delete(messageId)
          if (pendingPromiseResolve) pendingPromiseResolve(result)
        },
        reject: (error) => {
          this.pendingMessages.delete(messageId)
          if (pendingPromiseResolve) {
            pendingPromiseResolve({
              ok: false,
              messageId,
              targetAgentId,
              error: error.message,
            })
          }
        },
      }
      this.pendingMessages.set(messageId, pending)
      this.logger.log(`Waiting for response to message ${messageId.slice(0, 8)} (timeout: ${timeout / 1000}s)`)
    }

    // Deliver to target agent with retry logic
    try {
      await this.deliverWithRetry(targetAgentId, messageEvent)
      this.logger.log(`Message ${messageId.slice(0, 8)} routed: ${fromAgent.name} -> ${targetAgent.name} (${routing})`)

      // If NOT expecting response, return immediately
      if (!request.expectsResponse) {
        return { ok: true, messageId, targetAgentId }
      }

      // Return promise that will be resolved when response arrives
      return new Promise<SendAgentMessageResponse>((resolve) => {
        pendingPromiseResolve = resolve

        // Check if response already arrived while we were setting up
        const pending = this.pendingMessages.get(messageId)
        if (pending?.responseReceived) {
          // Response already came in, pending.resolve was already called
          // Nothing to do - the promise will be resolved by the stored resolve
        }
      })
    } catch (error) {
      // Clean up pending message on delivery failure
      this.pendingMessages.delete(messageId)
      this.logger.log(`Failed to deliver message ${messageId.slice(0, 8)}:`, error)
      return {
        ok: false,
        messageId,
        error: error instanceof Error ? error.message : 'Delivery failed',
      }
    }
  }

  /**
   * Deliver message with retry logic
   */
  private async deliverWithRetry(
    agentId: string,
    message: AgentMessageEvent | AgentBroadcastEvent,
    attempt: number = 1
  ): Promise<void> {
    try {
      await this.deliverMessage(agentId, message)
    } catch (error) {
      if (attempt >= RETRY_CONFIG.maxAttempts) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        RETRY_CONFIG.maxDelayMs
      )

      this.logger.log(`Delivery attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))

      return this.deliverWithRetry(agentId, message, attempt + 1)
    }
  }

  /**
   * Handle a response to a message
   *
   * This is called when an agent responds via the /agents/response endpoint.
   * It delivers the response back to the original sender and resolves their Promise.
   *
   * @param fromAgentId - The responding agent's ID
   * @param messageId - The original message ID being responded to
   * @param response - The response text
   * @param success - Whether the responding agent succeeded
   * @param error - Optional error message
   * @param data - Optional additional data
   */
  async handleResponse(
    fromAgentId: string,
    messageId: string,
    response: string,
    success: boolean,
    error?: string,
    data?: Record<string, unknown>
  ): Promise<{ delivered: boolean; error?: string }> {
    const pending = this.pendingMessages.get(messageId)
    const fromAgent = this.registry.get(fromAgentId)

    if (!fromAgent) {
      this.logger.log(`Response from unknown agent: ${fromAgentId}`)
      return { delivered: false, error: 'Responding agent not found in registry' }
    }

    if (!pending) {
      this.logger.log(`Response for non-pending message ${messageId.slice(0, 8)} - may have timed out`)
      // Still broadcast for UI, but don't try to deliver
      const responseEvent: AgentMessageResponseEvent = {
        id: randomUUID(),
        timestamp: Date.now(),
        type: 'agent_message_response',
        sessionId: fromAgentId,
        cwd: fromAgent.cwd ?? '',
        fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId: '',
        inResponseTo: messageId,
        response,
        data,
        success,
        error,
      }
      this.addToHistory(responseEvent)
      this.broadcastEvent(responseEvent)
      return { delivered: false, error: 'No pending message found (may have timed out)' }
    }

    const originalSender = this.registry.get(pending.fromAgentId)
    if (!originalSender) {
      this.logger.log(`Original sender ${pending.fromAgentId} no longer in registry`)
      pending.reject(new Error('Original sender no longer available'))
      return { delivered: false, error: 'Original sender no longer available' }
    }

    // Create response event for history and UI broadcast
    const responseEvent: AgentMessageResponseEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'agent_message_response',
      sessionId: pending.fromAgentId, // Use ORIGINAL SENDER's session ID
      cwd: originalSender.cwd ?? '',
      fromAgentId,
      fromAgentName: fromAgent.name,
      toAgentId: pending.fromAgentId,
      inResponseTo: messageId,
      response,
      data,
      success,
      error,
    }

    // Add to history
    this.addToHistory(responseEvent)

    // Broadcast the response event to UI clients
    this.broadcastEvent(responseEvent)

    // Deliver the response to the original sender agent
    try {
      // Create a response delivery message that preserves correlation
      const responseDeliveryMessage: AgentMessageEvent = {
        id: randomUUID(),
        timestamp: Date.now(),
        type: 'agent_message',
        sessionId: pending.fromAgentId, // CRITICAL: Use original sender's session
        cwd: originalSender.cwd ?? '',
        fromAgentId: fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId: pending.fromAgentId,
        routing: 'direct',
        message: this.formatResponseForDelivery(response, fromAgent.name, messageId, success, error),
        context: {
          isResponse: true,
          inResponseTo: messageId,
          originalMessage: pending.originalMessage,
          responseData: data,
          success,
          error,
        },
        priority: 'high', // Responses are high priority
        messageId: messageId, // CRITICAL: Preserve original messageId for correlation
        expectsResponse: false, // This is a response, not a new request
      }

      // Deliver with retry
      await this.deliverWithRetry(pending.fromAgentId, responseDeliveryMessage)

      this.logger.log(
        `Response delivered: ${fromAgent.name} -> ${originalSender.name} ` +
        `(messageId: ${messageId.slice(0, 8)}, success: ${success})`
      )

      // NOW resolve the pending Promise with FULL response data
      pending.resolve({
        ok: true,
        messageId,
        targetAgentId: pending.toAgentId,
        response,
        responseData: data,
        responseSuccess: success,
        responseReceivedAt: Date.now(),
        error: error,
      })

      return { delivered: true }
    } catch (deliveryError) {
      const errMsg = deliveryError instanceof Error ? deliveryError.message : 'Delivery failed'
      this.logger.log(`Failed to deliver response to ${originalSender.name}: ${errMsg}`)

      // Still resolve the Promise but indicate delivery failure
      pending.resolve({
        ok: false,
        messageId,
        targetAgentId: pending.toAgentId,
        response,
        responseData: data,
        responseSuccess: success,
        error: `Response received but delivery failed: ${errMsg}`,
      })

      return { delivered: false, error: errMsg }
    }
  }

  /**
   * Format response for delivery to the original sender
   */
  private formatResponseForDelivery(
    response: string,
    fromAgentName: string,
    messageId: string,
    success: boolean,
    error?: string
  ): string {
    if (!success) {
      return `[VIBECRAFT RESPONSE - ERROR]
================================================================================
From: ${fromAgentName}
In Response To: Message ${messageId.slice(0, 8)}
Status: FAILED
Error: ${error ?? 'Unknown error'}
================================================================================

${response}

================================================================================
[END RESPONSE]`
    }

    return `[VIBECRAFT RESPONSE]
================================================================================
From: ${fromAgentName}
In Response To: Message ${messageId.slice(0, 8)}
Status: SUCCESS
================================================================================

${response}

================================================================================
[END RESPONSE]`
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(
    fromAgentId: string,
    channel: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<{ sent: number; failed: number }> {
    const fromAgent = this.registry.get(fromAgentId)
    if (!fromAgent) {
      this.logger.log(`Broadcast from unknown agent: ${fromAgentId}`)
      return { sent: 0, failed: 0 }
    }

    const broadcastEvent: AgentBroadcastEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'agent_broadcast',
      sessionId: fromAgentId,
      cwd: fromAgent.cwd ?? '',
      fromAgentId,
      fromAgentName: fromAgent.name,
      channel,
      message,
      data,
    }

    // Add to history
    this.addToHistory(broadcastEvent)

    // Broadcast event to all UI clients
    this.broadcastEvent(broadcastEvent)

    // Deliver to all other agents that accept messages
    const targets = this.registry.getMessageableAgents()
      .filter(a => a.agentId !== fromAgentId && a.status !== 'offline')

    this.logger.log(`Broadcasting to ${targets.length} agents on channel: ${channel}`)

    let sent = 0
    let failed = 0

    // Deliver in parallel with individual error handling
    const deliveryPromises = targets.map(async (target) => {
      try {
        await this.deliverWithRetry(target.agentId, broadcastEvent)
        sent++
      } catch (error) {
        this.logger.debug(`Failed to deliver broadcast to ${target.name}:`, error)
        failed++
      }
    })

    await Promise.all(deliveryPromises)

    this.logger.log(`Broadcast complete: ${sent} delivered, ${failed} failed`)
    return { sent, failed }
  }

  /**
   * Check for timed out pending messages
   */
  private checkTimeouts(): void {
    const now = Date.now()
    for (const [messageId, pending] of this.pendingMessages) {
      if (now - pending.sentAt > pending.timeout) {
        this.logger.log(
          `Message ${messageId.slice(0, 8)} timed out after ${pending.timeout / 1000}s ` +
          `(${pending.fromAgentName} -> ${pending.toAgentName})`
        )
        pending.reject(new Error(`Response timeout after ${pending.timeout / 1000} seconds`))
        this.pendingMessages.delete(messageId)
      }
    }
  }

  /**
   * Add event to history (circular buffer)
   */
  private addToHistory(event: AgentMessageEvent | AgentMessageResponseEvent | AgentBroadcastEvent): void {
    this.messageHistory.push(event)
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift()
    }
  }

  /**
   * Get message history
   */
  getHistory(): Array<AgentMessageEvent | AgentMessageResponseEvent | AgentBroadcastEvent> {
    return [...this.messageHistory]
  }

  /**
   * Get pending message count
   */
  getPendingCount(): number {
    return this.pendingMessages.size
  }

  /**
   * Get details about pending messages (for debugging)
   */
  getPendingDetails(): Array<{
    messageId: string
    from: string
    to: string
    waitingFor: number
    timeout: number
  }> {
    const now = Date.now()
    return Array.from(this.pendingMessages.values()).map(p => ({
      messageId: p.messageId.slice(0, 8),
      from: p.fromAgentName,
      to: p.toAgentName,
      waitingFor: now - p.sentAt,
      timeout: p.timeout,
    }))
  }

  /**
   * Clear all pending messages
   */
  clearPending(): void {
    for (const [, pending] of this.pendingMessages) {
      pending.reject(new Error('Router cleared'))
    }
    this.pendingMessages.clear()
  }
}
