/**
 * Event Handlers - Barrel Export
 *
 * Import and call registerAllHandlers() to set up EventBus handlers.
 */

import { registerSoundHandlers } from './soundHandlers'
import { registerNotificationHandlers } from './notificationHandlers'
import { registerCharacterHandlers } from './characterHandlers'
import { registerSubagentHandlers } from './subagentHandlers'
import { registerZoneHandlers } from './zoneHandlers'
import { registerFeedHandlers } from './feedHandlers'
import { registerAnimationHandlers } from './animationHandlers'
import { registerAgentMessageHandlers } from './agentMessageHandlers'

/**
 * Register all EventBus handlers
 * Call this once during app initialization
 */
export function registerAllHandlers(): void {
  registerSoundHandlers()
  registerNotificationHandlers()
  registerCharacterHandlers()
  registerSubagentHandlers()
  registerZoneHandlers()
  registerFeedHandlers()
  registerAnimationHandlers()
  registerAgentMessageHandlers()
}

// Re-export individual registrations for testing
export {
  registerSoundHandlers,
  registerNotificationHandlers,
  registerCharacterHandlers,
  registerSubagentHandlers,
  registerZoneHandlers,
  registerFeedHandlers,
  registerAnimationHandlers,
  registerAgentMessageHandlers,
}
