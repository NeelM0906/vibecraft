/**
 * Agent Message Event Handlers
 *
 * Handles inter-agent communication events for visualization.
 */

import { eventBus } from '../EventBus'
import type {
  AgentMessageEvent,
  AgentMessageResponseEvent,
  AgentBroadcastEvent,
} from '../../../shared/types'

/**
 * Register agent message event handlers
 */
export function registerAgentMessageHandlers(): void {
  // Handle incoming agent message
  eventBus.on('agent_message', (event: AgentMessageEvent, ctx) => {
    if (!ctx.scene || !ctx.feedManager) return

    const { fromAgentName, toAgentId, toCapability, message, routing, priority } = event

    // Show notification on target zone
    if (toAgentId) {
      ctx.scene.zoneNotifications?.show(toAgentId, {
        text: `Message from ${fromAgentName}`,
        style: priority === 'urgent' ? 'warning' : 'info',
        icon: '\u{1F4E8}', // Envelope emoji
        duration: 3,
      })
    }

    // Show notification on sender zone
    const targetDesc = toAgentId
      ? `direct to ${toAgentId.slice(0, 8)}`
      : `to ${toCapability} expert`

    ctx.scene.zoneNotifications?.show(event.sessionId, {
      text: `Sent ${targetDesc}`,
      style: 'info',
      icon: '\u{1F4E4}', // Outbox emoji
      duration: 2,
    })

    // Play a sound for high priority messages
    if (ctx.soundEnabled && priority === 'urgent') {
      // Will be handled by sound handlers if implemented
    }
  })

  // Handle agent message response
  eventBus.on('agent_message_response', (event: AgentMessageResponseEvent, ctx) => {
    if (!ctx.scene || !ctx.feedManager) return

    const { fromAgentName, toAgentId, success } = event

    // Show notification on original sender's zone
    ctx.scene.zoneNotifications?.show(toAgentId, {
      text: `Response from ${fromAgentName}`,
      style: success ? 'success' : 'error',
      icon: success ? '\u2705' : '\u274C', // Check mark or X
      duration: 3,
    })
  })

  // Handle broadcast message
  eventBus.on('agent_broadcast', (event: AgentBroadcastEvent, ctx) => {
    if (!ctx.scene) return

    const { fromAgentName, channel, message } = event

    // Show notification on all zones (handled by iteration in main.ts)
    // For now, just show on sender's zone
    ctx.scene.zoneNotifications?.show(event.sessionId, {
      text: `Broadcast: ${channel}`,
      style: 'info',
      icon: '\u{1F4E2}', // Loudspeaker emoji
      duration: 3,
    })
  })
}
