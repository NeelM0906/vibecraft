/**
 * Vibecraft Event Types
 *
 * These types define the contract between:
 * - Hook scripts (produce events)
 * - WebSocket server (relay events)
 * - Three.js client (consume events)
 */

// ============================================================================
// Core Event Types
// ============================================================================

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'stop'
  | 'subagent_stop'
  | 'session_start'
  | 'session_end'
  | 'user_prompt_submit'
  | 'notification'
  | 'pre_compact'
  // Inter-agent communication events
  | 'agent_message'
  | 'agent_message_response'
  | 'agent_broadcast'

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task'
  | 'TodoWrite'
  | 'AskUserQuestion'
  | 'NotebookEdit'
  | string // MCP tools and future tools

// ============================================================================
// Base Event
// ============================================================================

export interface BaseEvent {
  /** Unique event ID */
  id: string
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Event type */
  type: HookEventType
  /** Claude Code session ID */
  sessionId: string
  /** Current working directory */
  cwd: string
}

// ============================================================================
// Tool Events
// ============================================================================

export interface PreToolUseEvent extends BaseEvent {
  type: 'pre_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolUseId: string
  /** Assistant text that came before this tool call */
  assistantText?: string
}

export interface PostToolUseEvent extends BaseEvent {
  type: 'post_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolResponse: Record<string, unknown>
  toolUseId: string
  success: boolean
  /** Duration in milliseconds (calculated from matching pre_tool_use) */
  duration?: number
}

// ============================================================================
// Lifecycle Events
// ============================================================================

export interface StopEvent extends BaseEvent {
  type: 'stop'
  stopHookActive: boolean
  /** Claude's text response (extracted from transcript) */
  response?: string
}

export interface SubagentStopEvent extends BaseEvent {
  type: 'subagent_stop'
  stopHookActive: boolean
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start'
  source: 'startup' | 'resume' | 'clear' | 'compact'
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end'
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other'
}

// ============================================================================
// User Interaction Events
// ============================================================================

export interface UserPromptSubmitEvent extends BaseEvent {
  type: 'user_prompt_submit'
  prompt: string
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification'
  message: string
  notificationType: 'permission_prompt' | 'idle_prompt' | 'auth_success' | 'elicitation_dialog' | string
}

// ============================================================================
// Other Events
// ============================================================================

export interface PreCompactEvent extends BaseEvent {
  type: 'pre_compact'
  trigger: 'manual' | 'auto'
  customInstructions?: string
}

// ============================================================================
// Inter-Agent Communication Events
// ============================================================================

/** Priority levels for inter-agent messages */
export type AgentMessagePriority = 'low' | 'normal' | 'high' | 'urgent'

/** Message routing modes */
export type AgentMessageRouting =
  | 'direct'      // Send to specific agent by ID
  | 'capability'  // Route to agent with matching capability
  | 'broadcast'   // Send to all agents

/** Agent capabilities for routing */
export type AgentCapability =
  | 'frontend'    // Frontend/UI expertise
  | 'backend'     // Backend/API expertise
  | 'database'    // Database expertise
  | 'testing'     // Testing expertise
  | 'devops'      // DevOps/infrastructure
  | 'security'    // Security expertise
  | 'general'     // General purpose
  | string        // Custom capabilities

/** Inter-agent message sent from one agent to another */
export interface AgentMessageEvent extends BaseEvent {
  type: 'agent_message'
  /** ID of the sending agent/session */
  fromAgentId: string
  /** Name of the sending agent (for display) */
  fromAgentName: string
  /** Target agent ID (for direct routing) */
  toAgentId?: string
  /** Target capability (for capability-based routing) */
  toCapability?: AgentCapability
  /** Routing mode */
  routing: AgentMessageRouting
  /** The message content */
  message: string
  /** Optional context/data attached to message */
  context?: Record<string, unknown>
  /** Message priority */
  priority: AgentMessagePriority
  /** Unique message ID for tracking responses */
  messageId: string
  /** Whether a response is expected */
  expectsResponse: boolean
  /** Timeout for response in ms (default: 30000) */
  responseTimeout?: number
}

/** Response to an inter-agent message */
export interface AgentMessageResponseEvent extends BaseEvent {
  type: 'agent_message_response'
  /** ID of the responding agent */
  fromAgentId: string
  /** Name of the responding agent */
  fromAgentName: string
  /** ID of the original sender */
  toAgentId: string
  /** ID of the message being responded to */
  inResponseTo: string
  /** The response content */
  response: string
  /** Optional data attached to response */
  data?: Record<string, unknown>
  /** Whether the request was handled successfully */
  success: boolean
  /** Error message if success is false */
  error?: string
}

/** Broadcast message to all agents */
export interface AgentBroadcastEvent extends BaseEvent {
  type: 'agent_broadcast'
  /** ID of the broadcasting agent */
  fromAgentId: string
  /** Name of the broadcasting agent */
  fromAgentName: string
  /** Broadcast channel/topic */
  channel: string
  /** The broadcast message */
  message: string
  /** Optional data attached to broadcast */
  data?: Record<string, unknown>
}

// ============================================================================
// Agent Registry Types
// ============================================================================

/** Entry in the agent registry */
export interface AgentRegistryEntry {
  /** Session/agent ID */
  agentId: string
  /** Display name */
  name: string
  /** Agent capabilities */
  capabilities: AgentCapability[]
  /** Current status */
  status: SessionStatus
  /** Session backend type */
  backend: SessionBackend
  /** Working directory */
  cwd?: string
  /** Last activity timestamp */
  lastActivity: number
  /** Whether agent accepts messages */
  acceptsMessages: boolean
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/** Request to register an agent */
export interface AgentRegistrationRequest {
  agentId: string
  name: string
  capabilities: AgentCapability[]
  acceptsMessages?: boolean
  metadata?: Record<string, unknown>
}

/** Request to send an inter-agent message */
export interface SendAgentMessageRequest {
  /** Target agent ID (for direct routing) */
  toAgentId?: string
  /** Target capability (for capability routing) */
  toCapability?: AgentCapability
  /** The message to send */
  message: string
  /** Optional context data */
  context?: Record<string, unknown>
  /** Priority level */
  priority?: AgentMessagePriority
  /** Whether to wait for response */
  expectsResponse?: boolean
  /** Response timeout in ms */
  responseTimeout?: number
}

/** Response from send message endpoint */
export interface SendAgentMessageResponse {
  ok: boolean
  /** ID of the sent message */
  messageId?: string
  /** ID of the target agent (after routing) */
  targetAgentId?: string
  /** Error message if failed */
  error?: string
  /** The actual response content (when expectsResponse=true and response received) */
  response?: string
  /** Additional response data */
  responseData?: Record<string, unknown>
  /** Whether the responding agent indicated success */
  responseSuccess?: boolean
  /** Timestamp when response was received */
  responseReceivedAt?: number
}

// ============================================================================
// Union Type
// ============================================================================

export type ClaudeEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | StopEvent
  | SubagentStopEvent
  | SessionStartEvent
  | SessionEndEvent
  | UserPromptSubmitEvent
  | NotificationEvent
  | PreCompactEvent
  // Inter-agent communication events
  | AgentMessageEvent
  | AgentMessageResponseEvent
  | AgentBroadcastEvent

// ============================================================================
// WebSocket Messages
// ============================================================================

/** Permission option (number + label) */
export interface PermissionOption {
  number: string   // "1", "2", "3"
  label: string    // "Yes", "Yes, and always allow...", "No"
}

/** Server -> Client messages */
export type ServerMessage =
  | { type: 'event'; payload: ClaudeEvent }
  | { type: 'history'; payload: ClaudeEvent[] }
  | { type: 'connected'; payload: { sessionId: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'tokens'; payload: { session: string; current: number; cumulative: number } }
  | { type: 'sessions'; payload: ManagedSession[] }
  | { type: 'session_update'; payload: ManagedSession }
  | { type: 'permission_prompt'; payload: { sessionId: string; tool: string; context: string; options: PermissionOption[] } }
  | { type: 'permission_resolved'; payload: { sessionId: string } }
  | { type: 'text_tiles'; payload: TextTile[] }
  // Inter-agent communication
  | { type: 'agent_registry'; payload: AgentRegistryEntry[] }
  | { type: 'agent_message'; payload: AgentMessageEvent }
  | { type: 'agent_message_response'; payload: AgentMessageResponseEvent }
  | { type: 'agent_broadcast'; payload: AgentBroadcastEvent }

/** Client -> Server messages */
export type ClientMessage =
  | { type: 'subscribe'; payload?: { sessionId?: string } }
  | { type: 'get_history'; payload?: { limit?: number } }
  | { type: 'ping' }
  | { type: 'voice_start' }
  | { type: 'voice_stop' }
  | { type: 'permission_response'; payload: { sessionId: string; response: string } }
  // Inter-agent communication
  | { type: 'get_agent_registry' }
  | { type: 'register_agent'; payload: AgentRegistrationRequest }
  | { type: 'send_agent_message'; payload: SendAgentMessageRequest & { fromAgentId: string } }
  | { type: 'agent_message_response'; payload: { messageId: string; response: string; success: boolean; error?: string } }

// ============================================================================
// Visualization State
// ============================================================================

/** Represents Claude's current activity state */
export type ClaudeState =
  | 'idle'           // Waiting for user input
  | 'thinking'       // Processing (between tools)
  | 'working'        // Using a tool
  | 'finished'       // Completed response

/** Station/location in the 3D workshop */
export type StationType =
  | 'center'         // Default idle position
  | 'bookshelf'      // Read
  | 'desk'           // Write
  | 'workbench'      // Edit
  | 'terminal'       // Bash
  | 'scanner'        // Grep/Glob
  | 'antenna'        // WebFetch/WebSearch
  | 'portal'         // Task (spawning subagents)
  | 'taskboard'      // TodoWrite

/** Map tools to stations */
export const TOOL_STATION_MAP: Record<ToolName, StationType> = {
  Read: 'bookshelf',
  Write: 'desk',
  Edit: 'workbench',
  Bash: 'terminal',
  Grep: 'scanner',
  Glob: 'scanner',
  WebFetch: 'antenna',
  WebSearch: 'antenna',
  Task: 'portal',
  TodoWrite: 'taskboard',
  AskUserQuestion: 'center',
  NotebookEdit: 'desk',
}

/** Get station for a tool (handles unknown/MCP tools) */
export function getStationForTool(tool: string): StationType {
  return TOOL_STATION_MAP[tool as ToolName] ?? 'center'
}

// ============================================================================
// Utility Types
// ============================================================================

/** Extract specific tool input types */
export interface BashToolInput {
  command: string
  description?: string
  timeout?: number
  run_in_background?: boolean
}

export interface WriteToolInput {
  file_path: string
  content: string
}

export interface EditToolInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export interface ReadToolInput {
  file_path: string
  offset?: number
  limit?: number
}

export interface TaskToolInput {
  description: string
  prompt: string
  subagent_type: string
}

// ============================================================================
// Session Management (Orchestration)
// ============================================================================

/** Status of a managed Claude session */
export type SessionStatus = 'idle' | 'working' | 'waiting' | 'offline'

/** Backend type for session execution */
export type SessionBackend = 'tmux' | 'sdk'

/** A managed Claude session */
export interface ManagedSession {
  /** Our internal ID (UUID) */
  id: string
  /** User-friendly name ("Frontend", "Tests") */
  name: string
  /** Backend type: 'tmux' (CLI via tmux) or 'sdk' (Anthropic API) */
  backend: SessionBackend
  /** Actual tmux session name (only for tmux backend) */
  tmuxSession?: string
  /** Current status */
  status: SessionStatus
  /** Claude Code session ID (from events, may differ from our ID) */
  claudeSessionId?: string
  /** Creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  lastActivity: number
  /** Working directory */
  cwd?: string
  /** Current tool being used (if working) */
  currentTool?: string
  /** Token count for this session */
  tokens?: {
    current: number
    cumulative: number
  }
  /** Git status for this session's working directory */
  gitStatus?: GitStatus
  /** Zone position in hex grid (for layout persistence) */
  zonePosition?: {
    q: number
    r: number
  }

  // SDK-specific fields
  /** Internal SDK session ID for Vibecraft tracking (only for sdk backend) */
  sdkSessionId?: string
  /** Claude Agent SDK's actual session ID for resumption (only for sdk backend) */
  sdkResumeId?: string
  /** Model used for SDK session */
  sdkModel?: 'sonnet' | 'opus' | 'haiku'
  /** Running cost in USD (only for sdk backend) */
  sdkCostUsd?: number
}

/** Git repository status */
export interface GitStatus {
  /** Current branch name */
  branch: string
  /** Commits ahead of upstream */
  ahead: number
  /** Commits behind upstream */
  behind: number
  /** Staged file counts */
  staged: {
    added: number
    modified: number
    deleted: number
  }
  /** Unstaged file counts */
  unstaged: {
    added: number
    modified: number
    deleted: number
  }
  /** Untracked file count */
  untracked: number
  /** Total changed files (staged + unstaged + untracked) */
  totalFiles: number
  /** Lines added (staged + unstaged) */
  linesAdded: number
  /** Lines removed (staged + unstaged) */
  linesRemoved: number
  /** Last commit timestamp (unix seconds) */
  lastCommitTime: number | null
  /** Last commit message (first line) */
  lastCommitMessage: string | null
  /** Whether directory is a git repo */
  isRepo: boolean
  /** Last time we checked (unix ms) */
  lastChecked: number
}

/** Known project directory for autocomplete */
export interface KnownProject {
  /** Absolute path to the directory */
  path: string
  /** Display name (defaults to directory basename) */
  name: string
  /** Last time this project was used (unix ms) */
  lastUsed: number
  /** Number of times this project has been opened */
  useCount: number
}

/** SDK permission mode options */
export type SDKPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

/** SDK session configuration options */
export interface SDKSessionOptions {
  /** Model to use (default: 'sonnet') */
  model?: 'sonnet' | 'opus' | 'haiku'
  /** Permission mode for tool use */
  permissionMode?: SDKPermissionMode
  /** Maximum budget in USD (optional) */
  maxBudgetUsd?: number
  /** Custom system prompt (optional) */
  systemPrompt?: string
  /** Session ID to resume (for restoring previous sessions) */
  resume?: string
}

/** Request to create a new session */
export interface CreateSessionRequest {
  name?: string
  cwd?: string
  /** Backend type: 'tmux' (default) or 'sdk' */
  backend?: SessionBackend
  /** Claude command flags (for tmux backend) */
  flags?: {
    continue?: boolean        // -c (continue last conversation)
    skipPermissions?: boolean  // --dangerously-skip-permissions
    chrome?: boolean        // --chrome
  }
  /** SDK options (for sdk backend) */
  sdkOptions?: SDKSessionOptions
}

/** Request to update a session */
export interface UpdateSessionRequest {
  name?: string
  zonePosition?: {
    q: number
    r: number
  }
}

/** Request to send a prompt to a session */
export interface SessionPromptRequest {
  prompt: string
  send?: boolean
}

/** Response for session operations */
export interface SessionResponse {
  ok: boolean
  session?: ManagedSession
  error?: string
}

/** Response for listing sessions */
export interface SessionListResponse {
  ok: boolean
  sessions: ManagedSession[]
}

// ============================================================================
// Text Tiles (Grid Labels)
// ============================================================================

/** A text label tile on the hex grid */
export interface TextTile {
  /** Unique ID (UUID) */
  id: string
  /** The label text */
  text: string
  /** Hex grid position */
  position: {
    q: number
    r: number
  }
  /** Optional color (hex string, default white) */
  color?: string
  /** Creation timestamp */
  createdAt: number
}

/** Request to create a text tile */
export interface CreateTextTileRequest {
  text: string
  position: {
    q: number
    r: number
  }
  color?: string
}

/** Request to update a text tile */
export interface UpdateTextTileRequest {
  text?: string
  position?: {
    q: number
    r: number
  }
  color?: string
}

// ============================================================================
// Configuration
// ============================================================================

export interface VibecraftConfig {
  /** WebSocket server port */
  serverPort: number
  /** Path to events JSONL file */
  eventsFile: string
  /** Maximum events to keep in memory */
  maxEventsInMemory: number
  /** Enable debug logging */
  debug: boolean
}

export const DEFAULT_CONFIG: VibecraftConfig = {
  serverPort: 4003,
  eventsFile: './data/events.jsonl',
  maxEventsInMemory: 1000,
  debug: false,
}
