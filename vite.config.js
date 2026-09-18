import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/**
 * Concatenates the markdown pages under public/ into a single /llms-full.txt,
 * the "everything in one fetch" document llms.txt links to. Generated rather
 * than hand-written so it can never drift from the pages it summarises.
 */
function buildLlmsFullTxt() {
  const parts = ['index.md', 'agents.md', 'auth.md', 'about.md', 'contact.md', 'privacy.md']

  const render = () => {
    const sections = parts.map((name) => {
      const path = fileURLToPath(new URL(`./public/${name}`, import.meta.url))
      return `<!-- source: https://wiedoethet.nl/${name} -->\n\n${readFileSync(path, 'utf8').trim()}`
    })

    return [
      '# Wie Doet Het — volledige context',
      '',
      '> Alle markdown-pagina\'s van wiedoethet.nl, samengevoegd in één document.',
      '> De losse pagina\'s en de korte index staan op https://wiedoethet.nl/llms.txt',
      '',
      sections.join('\n\n---\n\n'),
      '',
    ].join('\n')
  }

  return {
    name: 'build-llms-full-txt',
    configureServer(server) {
      server.middlewares.use('/llms-full.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(render())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: render() })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
    }),
    buildLlmsFullTxt(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
