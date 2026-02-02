Research Report: Vibecraft Architecture & Alternatives                                                                                                    
                                                                                                                                                            
  Current Architecture Summary                                                                                                                              
                                                                                                                                                            
  ┌─────────────────────────────────────────────────────────────────────────┐                                                                               
  │                        CURRENT ARCHITECTURE                              │                                                                              
  ├─────────────────────────────────────────────────────────────────────────┤                                                                               
  │                                                                          │                                                                              
  │  Claude Code CLI (requires subscription)                                │                                                                               
  │       │                                                                  │                                                                              
  │       ▼                                                                  │                                                                              
  │  Hook System (8 hooks in ~/.claude/settings.json)                       │                                                                               
  │       │                                                                  │                                                                              
  │       ▼                                                                  │                                                                              
  │  vibecraft-hook.sh (bash script reads stdin, transforms with jq)        │                                                                               
  │       │                                                                  │                                                                              
  │       ├──▶ events.jsonl (file persistence)                              │                                                                               
  │       └──▶ POST /event (real-time)                                      │                                                                               
  │               │                                                          │                                                                              
  │               ▼                                                          │                                                                              
  │  WebSocket Server (broadcasts to clients)                               │                                                                               
  │       │                                                                  │                                                                              
  │       ▼                                                                  │                                                                              
  │  Browser (Three.js visualization)                                       │                                                                               
  │                                                                          │                                                                              
  │  ════════════════════════════════════════                               │                                                                               
  │  tmux is used for:                                                       │                                                                              
  │  • Session isolation (multiple Claude instances)                        │                                                                               
  │  • Prompt injection (/prompt endpoint → tmux send-keys)                 │                                                                               
  │  • Output capture (token counts, permission prompts)                    │                                                                               
  │  • Persistence (sessions survive server restarts)                       │                                                                               
  └─────────────────────────────────────────────────────────────────────────┘                                                                               
                                                                                                                                                            
  Pain Points:                                                                                                                                              
  1. Requires Claude Code subscription ($20/month or enterprise)                                                                                            
  2. tmux is mandatory for prompt injection                                                                                                                 
  3. Hook script is fragile (depends on jq, curl, PATH issues)                                                                                              
  4. No programmatic control - just observation                                                                                                             
                                                                                                                                                            
  ---                                                                                                                                                       
  The Solution: Claude Agent SDK                                                                                                                            
                                                                                                                                                            
  The https://platform.claude.com/docs/en/agent-sdk/overview (released Jan 2026) is exactly what you need. It provides:                                     
  ┌──────────────────┬──────────────────────────┬──────────────────────────────────────┐                                                                    
  │     Feature      │   Current (Hook-based)   │              Agent SDK               │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ Authentication   │ Claude Code subscription │ Anthropic API key ✅                 │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ Event capture    │ Bash hook script         │ Native Python/TS hooks ✅            │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ Tool execution   │ Claude Code internal     │ Built-in (Read, Edit, Bash, etc.) ✅ │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ Session control  │ tmux send-keys           │ Programmatic query() API ✅          │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ Streaming events │ File watching + POST     │ Async iterator ✅                    │                                                                    
  ├──────────────────┼──────────────────────────┼──────────────────────────────────────┤                                                                    
  │ tmux required?   │ Yes                      │ No ✅                                │                                                                    
  └──────────────────┴──────────────────────────┴──────────────────────────────────────┘                                                                    
  Key insight: The Agent SDK gives you the same tools, hooks, and agent loop that power Claude Code, but as a library you control programmatically.         
                                                                                                                                                            
  ---                                                                                                                                                       
  Proposed Architecture Options                                                                                                                             
                                                                                                                                                            
  Option A: Hybrid (Minimal Change)                                                                                                                         
                                                                                                                                                            
  Keep existing architecture, add SDK as an alternative backend.                                                                                            
                                                                                                                                                            
  ┌─────────────────────────────────────────────────────────────────────────┐                                                                               
  │                         OPTION A: HYBRID                                 │                                                                              
  ├─────────────────────────────────────────────────────────────────────────┤                                                                               
  │                                                                          │                                                                              
  │  ┌──────────────────┐         ┌──────────────────┐                      │                                                                               
  │  │ Claude Code CLI  │         │ Claude Agent SDK │                      │                                                                               
  │  │ (existing flow)  │         │ (new backend)    │                      │                                                                               
  │  └────────┬─────────┘         └────────┬─────────┘                      │                                                                               
  │           │                            │                                 │                                                                              
  │           ▼                            ▼                                 │                                                                              
  │  ┌─────────────────────────────────────────────────┐                    │                                                                               
  │  │            Unified Event Format                  │                    │                                                                              
  │  │     { type, sessionId, tool, toolUseId, ... }   │                    │                                                                               
  │  └─────────────────────────────────────────────────┘                    │                                                                               
  │                          │                                               │                                                                              
  │                          ▼                                               │                                                                              
  │               WebSocket Server (unchanged)                              │                                                                               
  │                          │                                               │                                                                              
  │                          ▼                                               │                                                                              
  │               Browser (unchanged)                                       │                                                                               
  └─────────────────────────────────────────────────────────────────────────┘                                                                               
                                                                                                                                                            
  Pros: Minimal refactor, backwards compatible                                                                                                              
  Cons: Two code paths to maintain                                                                                                                          
                                                                                                                                                            
  Option B: SDK-First (Recommended)                                                                                                                         
                                                                                                                                                            
  Replace hook-based capture with SDK-driven agent.                                                                                                         
                                                                                                                                                            
  ┌─────────────────────────────────────────────────────────────────────────┐                                                                               
  │                      OPTION B: SDK-FIRST                                 │                                                                              
  ├─────────────────────────────────────────────────────────────────────────┤                                                                               
  │                                                                          │                                                                              
  │  Browser (Three.js)                                                     │                                                                               
  │       │                                                                  │                                                                              
  │       │ WebSocket: { action: "prompt", text: "fix the bug" }            │                                                                               
  │       ▼                                                                  │                                                                              
  │  ┌─────────────────────────────────────────────────────────────┐        │                                                                               
  │  │                    Node.js Server                            │        │                                                                              
  │  │                                                              │        │                                                                              
  │  │   const sdk = require('@anthropic-ai/claude-agent-sdk')     │        │                                                                               
  │  │                                                              │        │                                                                              
  │  │   // Hooks emit events to WebSocket clients                 │        │                                                                               
  │  │   options = {                                                │        │                                                                              
  │  │     hooks: {                                                 │        │                                                                              
  │  │       PreToolUse: [(input) => broadcast('pre_tool_use', input)],    │                                                                                
  │  │       PostToolUse: [(input) => broadcast('post_tool_use', input)],  │                                                                                
  │  │       Stop: [(input) => broadcast('stop', input)],          │        │                                                                               
  │  │     }                                                        │        │                                                                              
  │  │   }                                                          │        │                                                                              
  │  │                                                              │        │                                                                              
  │  │   for await (const msg of query(prompt, options)) {         │        │                                                                               
  │  │     // Stream messages to client                             │        │                                                                              
  │  │   }                                                          │        │                                                                              
  │  └─────────────────────────────────────────────────────────────┘        │                                                                               
  │       │                                                                  │                                                                              
  │       │ WebSocket: { type: "pre_tool_use", tool: "Read", ... }          │                                                                               
  │       ▼                                                                  │                                                                              
  │  Browser (unchanged visualization)                                      │                                                                               
  │                                                                          │                                                                              
  └─────────────────────────────────────────────────────────────────────────┘                                                                               
                                                                                                                                                            
  Pros:                                                                                                                                                     
  - No tmux dependency                                                                                                                                      
  - No bash hook script                                                                                                                                     
  - Full programmatic control                                                                                                                               
  - Works with API key                                                                                                                                      
  - Cleaner architecture                                                                                                                                    
                                                                                                                                                            
  Cons:                                                                                                                                                     
  - Larger refactor                                                                                                                                         
  - Server becomes stateful (holds SDK sessions)                                                                                                            
                                                                                                                                                            
  Option C: Keep tmux Optional for Power Users                                                                                                              
                                                                                                                                                            
  SDK-first, but allow linking to external Claude Code sessions.                                                                                            
                                                                                                                                                            
  Mode 1: SDK Mode (default)                                                                                                                                
    - User enters prompt in browser                                                                                                                         
    - Server runs SDK query()                                                                                                                               
    - Events stream directly                                                                                                                                
                                                                                                                                                            
  Mode 2: Observer Mode (optional)                                                                                                                          
    - User runs Claude Code in their own terminal                                                                                                           
    - Hooks still work (existing flow)                                                                                                                      
    - No prompt injection from browser                                                                                                                      
                                                                                                                                                            
  ---                                                                                                                                                       
  Implementation Roadmap (Start Small)                                                                                                                      
                                                                                                                                                            
  Phase 1: Add SDK Backend (1-2 days)                                                                                                                       
                                                                                                                                                            
  Create a new "SDK session" type alongside existing tmux sessions.                                                                                         
                                                                                                                                                            
  // server/sdk-session.ts                                                                                                                                  
  import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk'                                                                                
                                                                                                                                                            
  export async function runSDKSession(                                                                                                                      
    prompt: string,                                                                                                                                         
    onEvent: (event: ClaudeEvent) => void                                                                                                                   
  ) {                                                                                                                                                       
    const options: ClaudeAgentOptions = {                                                                                                                   
      allowedTools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],                                                                                               
      permissionMode: 'bypassPermissions',                                                                                                                  
      hooks: {                                                                                                                                              
        PreToolUse: [async (input) => {                                                                                                                     
          onEvent({                                                                                                                                         
            type: 'pre_tool_use',                                                                                                                           
            tool: input.tool_name,                                                                                                                          
            toolInput: input.tool_input,                                                                                                                    
            toolUseId: input.tool_use_id,                                                                                                                   
            // ... map to existing event format                                                                                                             
          })                                                                                                                                                
          return {}                                                                                                                                         
        }],                                                                                                                                                 
        PostToolUse: [async (input) => {                                                                                                                    
          onEvent({                                                                                                                                         
            type: 'post_tool_use',                                                                                                                          
            tool: input.tool_name,                                                                                                                          
            success: input.tool_result?.success ?? true,                                                                                                    
            // ...                                                                                                                                          
          })                                                                                                                                                
          return {}                                                                                                                                         
        }],                                                                                                                                                 
      }                                                                                                                                                     
    }                                                                                                                                                       
                                                                                                                                                            
    for await (const message of query({ prompt, options })) {                                                                                               
      // Handle streaming response                                                                                                                          
    }                                                                                                                                                       
  }                                                                                                                                                         
                                                                                                                                                            
  Phase 2: UI Toggle (1 day)                                                                                                                                
                                                                                                                                                            
  Add setting to choose between:                                                                                                                            
  - "SDK Mode" (uses API key, no tmux)                                                                                                                      
  - "Observer Mode" (watches external Claude Code)                                                                                                          
                                                                                                                                                            
  Phase 3: Remove tmux Dependency (2-3 days)                                                                                                                
                                                                                                                                                            
  - Replace tmux session management with SDK session management                                                                                             
  - Store session state in memory/file instead of tmux                                                                                                      
  - Keep tmux as optional for power users                                                                                                                   
                                                                                                                                                            
  ---                                                                                                                                                       
  Code Changes Required                                                                                                                                     
  ┌───────────────────────┬───────────────────────────────────────────────┐                                                                                 
  │         File          │                    Change                     │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ server/index.ts       │ Add SDK session runner alongside tmux         │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ server/sdk-session.ts │ New file: SDK wrapper with event hooks        │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ shared/types.ts       │ Add sessionType: 'sdk' | 'tmux' | 'observer'  │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ src/main.ts           │ Update session creation UI for SDK mode       │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ package.json          │ Add @anthropic-ai/claude-agent-sdk dependency │                                                                                 
  ├───────────────────────┼───────────────────────────────────────────────┤                                                                                 
  │ .env                  │ Add ANTHROPIC_API_KEY                         │                                                                                 
  └───────────────────────┴───────────────────────────────────────────────┘                                                                                 
  ---                                                                                                                                                       
  Cost Comparison                                                                                                                                           
  ┌───────────────────────┬────────────────────────┬─────────────────────┐                                                                                  
  │         Mode          │          Cost          │    Requirements     │                                                                                  
  ├───────────────────────┼────────────────────────┼─────────────────────┤                                                                                  
  │ Current (Claude Code) │ $20/month subscription │ Claude Code account │                                                                                  
  ├───────────────────────┼────────────────────────┼─────────────────────┤                                                                                  
  │ SDK Mode              │ ~$3/1M input tokens    │ Anthropic API key   │                                                                                  
  ├───────────────────────┼────────────────────────┼─────────────────────┤                                                                                  
  │ SDK Mode (Bedrock)    │ AWS pricing            │ AWS account         │                                                                                  
  ├───────────────────────┼────────────────────────┼─────────────────────┤                                                                                  
  │ SDK Mode (Vertex)     │ GCP pricing            │ GCP account         │                                                                                  
  └───────────────────────┴────────────────────────┴─────────────────────┘                                                                                  
  For typical usage (10-20 queries/day), SDK mode would cost $5-15/month vs $20 fixed.                                                                      
                                                                                                                                                            
  ---                                                                                                                                                       
  Summary                                                                                                                                                   
                                                                                                                                                            
  The Claude Agent SDK is the answer. It provides:                                                                                                          
                                                                                                                                                            
  1. ✅ API key authentication - No subscription required                                                                                                   
  2. ✅ tmux optional - Full programmatic control                                                                                                           
  3. ✅ Native hooks - PreToolUse, PostToolUse, Stop (same events!)                                                                                         
  4. ✅ Same tools - Read, Edit, Bash, Glob, Grep, WebFetch                                                                                                 
  5. ✅ Streaming - Async iterator for real-time events                                                                                                     
  6. ✅ TypeScript SDK - Direct integration with your Node.js server                                                                                        
                                                                                                                                                            
  Recommended approach: Start with Phase 1 (add SDK backend), keep existing tmux flow working, then gradually migrate.                                      
                                                                                                                                                            
  ---                                                                                                                                                       
  Sources:                                                                                                                                                  
  - https://platform.claude.com/docs/en/agent-sdk/overview                                                                                                  
  - https://github.com/anthropics/claude-agent-sdk-python                                                                                                   
  - https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk                                                                         
  - https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk                                                   