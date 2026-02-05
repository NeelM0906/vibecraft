/**
 * Statistics Event Handlers
 *
 * Tracks task completions and other zone statistics
 */

import { eventBus } from '../EventBus'
import type { PostToolUseEvent, StopEvent } from '../../../shared/types'

export function registerStatisticsHandlers(): void {
  // Track request fulfillment - when Claude finishes responding to a user prompt
  eventBus.on('stop', (event, ctx) => {
    const stopEvent = event as StopEvent

    const { scene, session } = ctx
    if (!scene || !session) return

    try {
      // Count this as a fulfilled request (1 task completed)
      scene.updateTaskCompletions(stopEvent.sessionId, 1)

      // Trigger celebration animation on the character
      if (session.claude) {
        console.log(`✅ Request fulfilled! Playing victory dance for session ${stopEvent.sessionId.slice(0, 8)}`)
        session.claude.playCelebration()
      }
    } catch (error) {
      console.error('Error tracking request fulfillment:', error)
    }
  })

  // Track TodoWrite tool usage to count task completions
  eventBus.on('post_tool_use', (event, ctx) => {
    const postEvent = event as PostToolUseEvent

    // Only handle TodoWrite events
    if (postEvent.tool !== 'TodoWrite') return

    const { scene, session } = ctx
    if (!scene) return

    try {
      // Parse todos from tool input
      const toolInput = postEvent.toolInput as { todos?: Array<{ content?: string; status?: string }> }
      const todos = toolInput.todos

      if (!todos || !Array.isArray(todos)) return

      // Get the zone to access previous snapshot
      const zone = scene.zones.get(postEvent.sessionId)
      if (!zone) return

      const currentSnapshot = todos.map(t => ({
        content: t.content || '',
        status: t.status || 'pending'
      }))

      // Calculate newly completed tasks by comparing with previous snapshot
      let newlyCompletedCount = 0

      for (const currentTodo of currentSnapshot) {
        if (currentTodo.status === 'completed') {
          // Check if this task was NOT completed in the previous snapshot
          const previousTodo = zone.statistics.lastTodoSnapshot.find(
            prev => prev.content === currentTodo.content
          )

          // Count as newly completed if:
          // 1. It didn't exist before (new task added as completed), OR
          // 2. It existed but was not completed before
          if (!previousTodo || previousTodo.status !== 'completed') {
            newlyCompletedCount++
          }
        }
      }

      // Update the snapshot for next comparison
      zone.statistics.lastTodoSnapshot = currentSnapshot

      if (newlyCompletedCount > 0) {
        // Update zone statistics
        scene.updateTaskCompletions(postEvent.sessionId, newlyCompletedCount)

        // Trigger celebration animation on the character
        if (session?.claude) {
          console.log(`🎉 ${newlyCompletedCount} task(s) newly completed! Playing victory dance for session ${postEvent.sessionId.slice(0, 8)}`)
          session.claude.playCelebration()
        }
      }
    } catch (error) {
      console.error('Error tracking task completions:', error)
    }
  })
}
