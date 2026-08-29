# Nuxt AI Assistant Hub

<br>

## 💖 Support this project
If you found this project helpful, please consider supporting it!

[![GitHub Sponsor](https://img.shields.io/badge/Sponsor-JuanmanDev-ea4aaa?style=for-the-badge&logo=github)](https://github.com/sponsors/JuanmanDev) [![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/juanmandev) [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/juanmandev)

<br>


A production-ready, scalable AI Assistant Web Application built with Nuxt 4, featuring MCP (Model Context Protocol) integration, secure code sandbox, autonomous agents, and dynamic UI rendering.

## Features

### Core Architecture
- **Nuxt 4** with Nitro backend for SSR/SSG hybrid rendering
- **Nuxt UI** for accessible, animated components
- **Drizzle ORM** with PostgreSQL for type-safe database operations
- **LiteLLM** as universal LLM gateway (OpenAI, Anthropic, Google, Ollama, etc.)
- **Auth.js** for authentication with RBAC

### AI & Model Integration
- Universal LLM routing via LiteLLM
- Support for reasoning/thinking models (o1, DeepSeek R1)
- Multi-step tool calling with MCP tools
- Tracing and observability for token usage

### MCP (Model Context Protocol)
- Visual GUI and JSON editor for MCP server management
- Auto-profiling of MCP tools using AI
- Dynamic UI component rendering from MCP responses
- Self-hosting: expose app memory/cron as outgoing MCP server

### Secure Code Sandbox
- Browser-first execution with WebContainers (Node.js)
- Python execution via Pyodide
- Optional Docker isolation for server-side execution

### Autonomous Agents & Scheduling
- BullMQ-backed job queues with Redis
- Cron-based scheduling for AI behaviors
- Background jobs with full access to LiteLLM, MCP, and memory

### Vector Memory System
- PostgreSQL with pgvector for semantic search
- Long-term memory categorized by topics, tags, groups
- Dashboard for memory management
- Automatic context injection during chat

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- Redis 6+
- LiteLLM instance (optional but recommended)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd nuxt-ai-assistant

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your configuration

# Generate database schema
npm run db:push

# Start development server
npm run dev
```

### Docker Deployment

```bash
# Build image
docker build -t nuxt-ai-assistant .

# Run container
docker run -d \
  --name ai-assistant \
  -p 3000:3000 \
  --env-file .env \
  nuxt-ai-assistant
```

## Project Structure

```
src/
├── components/
│   ├── chat/          # Chat interface components
│   ├── mcp/           # MCP UI components
│   ├── sandbox/       # Code sandbox components
│   ├── cron/          # Job scheduler UI
│   ├── memory/        # Memory dashboard
│   └── dynamic/       # Dynamic component renderer
├── composables/       # Vue composables
├── lib/
│   ├── ai/            # AI service & LiteLLM integration
│   ├── db/            # Database connection & types
│   ├── schema/        # Drizzle ORM schema
│   ├── mcp/           # MCP client & server
│   ├── memory/        # Memory service with pgvector
│   ├── cron/          # BullMQ integration
│   └── sandbox/       # Code sandbox service
├── server/
│   ├── api/           # Nitro API routes
│   │   ├── chat/      # Chat endpoints
│   │   ├── mcp/       # MCP management
│   │   ├── cron/      # Job scheduling
│   │   ├── memory/    # Memory CRUD
│   │   └── sandbox/   # Sandbox execution
│   └── tasks/         # Background tasks
├── stores/            # Pinia stores
└── types/             # TypeScript types
```

## Environment Variables

See `.env.example` for all configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection for BullMQ | redis://localhost:6379 |
| `LITELLM_BASE_URL` | LiteLLM gateway URL | http://localhost:4000 |
| `AUTH_SECRET` | Auth.js secret key | Required in prod |
| `WEBCONTAINER_API_KEY` | WebContainers API key | Optional |

## API Endpoints

- `POST /api/chat` - AI chat with streaming
- `GET/POST /api/mcp/servers` - MCP server management
- `GET/POST /api/cron/jobs` - Job scheduling
- `GET/POST /api/memory` - Memory CRUD
- `POST /api/sandbox/:id/execute` - Code execution

## License

MIT


<br>

## 💖 Support this project
If you found this project helpful, please consider supporting it!

[![GitHub Sponsor](https://img.shields.io/badge/Sponsor-JuanmanDev-ea4aaa?style=for-the-badge&logo=github)](https://github.com/sponsors/JuanmanDev) [![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/juanmandev) [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/juanmandev)

<br>
