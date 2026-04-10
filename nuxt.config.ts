// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/auth',
    '@nuxt/image',
  ],

  // Nuxt UI Configuration
  ui: {
    icons: ['heroicons', 'lucide'],
  },

  // Auth Configuration
  auth: {
    provider: {
      type: 'authjs',
    },
  },

  // Nitro Server Configuration
  nitro: {
    experimental: {
      tasks: true,
    },
    storage: {
      drivers: {
        fs: { driver: 'fs' },
      },
    },
  },

  // Runtime Config (12-Factor App)
  runtimeConfig: {
    // Public keys that are exposed to the client
    public: {
      appUrl: process.env.APP_URL || 'http://localhost:3000',
    },
    // Secret keys kept on the server
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_assistant',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    liteLlmBaseUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000',
    liteLlmApiKey: process.env.LITELLM_API_KEY || '',
    authSecret: process.env.AUTH_SECRET || 'change-me-in-production',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    webcontainerApiKey: process.env.WEBCONTAINER_API_KEY || '',
  },

  // TypeScript Configuration
  typescript: {
    strict: true,
    typeCheck: true,
  },

  // CSS
  css: ['~/assets/css/main.css'],

  // App Configuration
  app: {
    head: {
      title: 'AI Assistant Hub',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Production-ready AI Assistant with MCP, Sandbox, and Autonomous Agents' },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },

  // Vite Configuration for WebContainers
  vite: {
    optimizeDeps: {
      include: ['@webcontainer/api', '@pyodide/pyodide'],
    },
    define: {
      'process.env.WEBCONTAINERS_API_KEY': JSON.stringify(process.env.WEBCONTAINER_API_KEY),
    },
  },

  // Ignore patterns
  ignore: ['**/*.test.ts', '**/*.spec.ts'],
});
