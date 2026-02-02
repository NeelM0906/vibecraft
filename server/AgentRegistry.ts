/**
 * AgentRegistry - Manages inter-agent discovery and capabilities
 *
 * This module provides a registry for agents to discover each other
 * and route messages based on capabilities.
 */

import type {
  AgentRegistryEntry,
  AgentCapability,
  AgentRegistrationRequest,
  SessionStatus,
  SessionBackend,
  ManagedSession,
} from '../shared/types.js'

/** Logger interface */
interface Logger {
  log: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/** Callback for broadcasting registry changes */
type RegistryChangeCallback = (registry: AgentRegistryEntry[]) => void

/**
 * Manages the agent registry for inter-agent communication
 */
export class AgentRegistry {
  /** Registered agents indexed by agent ID */
  private agents = new Map<string, AgentRegistryEntry>()

  /** Callbacks for registry changes */
  private changeCallbacks: RegistryChangeCallback[] = []

  /** Logger */
  private logger: Logger

  constructor(logger?: Logger) {
    this.logger = logger ?? {
      log: (...args) => console.log('[AgentRegistry]', ...args),
      debug: () => {}, // No-op by default
    }
  }

  /**
   * Register a new agent or update existing registration
   */
  register(request: AgentRegistrationRequest, session: ManagedSession): AgentRegistryEntry {
    const entry: AgentRegistryEntry = {
      agentId: request.agentId,
      name: request.name,
      capabilities: request.capabilities,
      status: session.status,
      backend: session.backend,
      cwd: session.cwd,
      lastActivity: session.lastActivity,
      acceptsMessages: request.acceptsMessages ?? true,
      metadata: request.metadata,
    }

    this.agents.set(request.agentId, entry)
    this.logger.log(`Registered agent: ${entry.name} (${entry.agentId}) with capabilities: [${entry.capabilities.join(', ')}]`)
    this.notifyChange()

    return entry
  }

  /**
   * Auto-register an agent from a managed session
   * Infers capabilities from session name and metadata
   */
  registerFromSession(session: ManagedSession): AgentRegistryEntry {
    const capabilities = this.inferCapabilities(session)

    const entry: AgentRegistryEntry = {
      agentId: session.id,
      name: session.name,
      capabilities,
      status: session.status,
      backend: session.backend,
      cwd: session.cwd,
      lastActivity: session.lastActivity,
      acceptsMessages: true,
      metadata: {},
    }

    this.agents.set(session.id, entry)
    this.logger.debug(`Auto-registered agent from session: ${entry.name} (${entry.agentId})`)
    this.notifyChange()

    return entry
  }

  /**
   * Infer capabilities from session name and metadata
   */
  private inferCapabilities(session: ManagedSession): AgentCapability[] {
    const capabilities: AgentCapability[] = ['general']
    const nameLower = session.name.toLowerCase()

    // Infer from name keywords
    if (nameLower.includes('frontend') || nameLower.includes('ui') || nameLower.includes('react') || nameLower.includes('vue')) {
      capabilities.push('frontend')
    }
    if (nameLower.includes('backend') || nameLower.includes('api') || nameLower.includes('server')) {
      capabilities.push('backend')
    }
    if (nameLower.includes('database') || nameLower.includes('db') || nameLower.includes('sql') || nameLower.includes('postgres')) {
      capabilities.push('database')
    }
    if (nameLower.includes('test') || nameLower.includes('spec') || nameLower.includes('e2e')) {
      capabilities.push('testing')
    }
    if (nameLower.includes('devops') || nameLower.includes('deploy') || nameLower.includes('ci') || nameLower.includes('docker')) {
      capabilities.push('devops')
    }
    if (nameLower.includes('security') || nameLower.includes('auth') || nameLower.includes('secure')) {
      capabilities.push('security')
    }

    return [...new Set(capabilities)] // Remove duplicates
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const existed = this.agents.delete(agentId)
    if (existed) {
      this.logger.log(`Unregistered agent: ${agentId}`)
      this.notifyChange()
    }
    return existed
  }

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: SessionStatus): void {
    const entry = this.agents.get(agentId)
    if (entry) {
      entry.status = status
      entry.lastActivity = Date.now()
      this.notifyChange()
    }
  }

  /**
   * Update agent from session data
   */
  updateFromSession(session: ManagedSession): void {
    const entry = this.agents.get(session.id)
    if (entry) {
      entry.status = session.status
      entry.lastActivity = session.lastActivity
      entry.cwd = session.cwd
      this.notifyChange()
    } else {
      // Auto-register if not found
      this.registerFromSession(session)
    }
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): AgentRegistryEntry | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Get all registered agents
   */
  getAll(): AgentRegistryEntry[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get agents that accept messages
   */
  getMessageableAgents(): AgentRegistryEntry[] {
    return this.getAll().filter(a => a.acceptsMessages && a.status !== 'offline')
  }

  /**
   * Find agents by capability
   */
  findByCapability(capability: AgentCapability): AgentRegistryEntry[] {
    return this.getAll().filter(
      agent => agent.capabilities.includes(capability) &&
               agent.acceptsMessages &&
               agent.status !== 'offline'
    )
  }

  /**
   * Find the best agent for a capability
   * Prefers: idle > working > waiting, then by last activity
   */
  findBestForCapability(capability: AgentCapability, excludeAgentId?: string): AgentRegistryEntry | undefined {
    const candidates = this.findByCapability(capability)
      .filter(a => a.agentId !== excludeAgentId)

    if (candidates.length === 0) return undefined

    // Sort by status priority, then by last activity
    const statusPriority: Record<SessionStatus, number> = {
      idle: 0,
      working: 1,
      waiting: 2,
      offline: 3,
    }

    candidates.sort((a, b) => {
      const statusDiff = statusPriority[a.status] - statusPriority[b.status]
      if (statusDiff !== 0) return statusDiff
      return b.lastActivity - a.lastActivity // More recent first
    })

    return candidates[0]
  }

  /**
   * Check if an agent exists and is online
   */
  isOnline(agentId: string): boolean {
    const entry = this.agents.get(agentId)
    return entry !== undefined && entry.status !== 'offline'
  }

  /**
   * Subscribe to registry changes
   */
  onChange(callback: RegistryChangeCallback): () => void {
    this.changeCallbacks.push(callback)
    return () => {
      const index = this.changeCallbacks.indexOf(callback)
      if (index !== -1) {
        this.changeCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Notify all subscribers of registry change
   */
  private notifyChange(): void {
    const registry = this.getAll()
    for (const callback of this.changeCallbacks) {
      try {
        callback(registry)
      } catch (error) {
        this.logger.log('Error in registry change callback:', error)
      }
    }
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.agents.clear()
    this.logger.log('Cleared all agent registrations')
    this.notifyChange()
  }

  /**
   * Get registry statistics
   */
  getStats(): { total: number; online: number; byCapability: Record<string, number> } {
    const all = this.getAll()
    const byCapability: Record<string, number> = {}

    for (const agent of all) {
      for (const cap of agent.capabilities) {
        byCapability[cap] = (byCapability[cap] ?? 0) + 1
      }
    }

    return {
      total: all.length,
      online: all.filter(a => a.status !== 'offline').length,
      byCapability,
    }
  }
}
