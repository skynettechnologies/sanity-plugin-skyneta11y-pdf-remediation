import {definePlugin} from 'sanity'

import PluginIcon from './icon'
import {resolvePdfConfig, type PdfRemediationOptions} from './lib/config'
import PdfRemediationPage from './PdfRemediationPage'

export const PLUGIN_NAME = 'sanity-plugin-skyneta11y-pdf-remediation'

export interface AiPdfRemediationConfig extends PdfRemediationOptions {
  /**
   * Tool name used in the Studio URL: /<workspace>/<name>.
   * Defaults to `ai-pdf-remediation`.
   */
  name?: string
  /**
   * Label shown in the Studio navbar menu.
   * Defaults to `AI PDF Remediation`.
   */
  title?: string
}

/**
 * Registers the AI PDF Accessibility Remediation workspace as a Studio tool,
 * so it appears as a menu item in the Studio navbar.
 *
 * @example
 * ```ts
 * import {defineConfig} from 'sanity'
 * import {structureTool} from 'sanity/structure'
 * import {AiPdfRemediation} from 'sanity-plugin-ai-pdf-remediation'
 *
 * export default defineConfig({
 *   plugins: [structureTool(), AiPdfRemediation()],
 * })
 * ```
 *
 * @public
 */
export const AiPdfRemediation = definePlugin<AiPdfRemediationConfig | void>((options) => {
  const {name, title, ...pdfOptions} = options || {}
  // Resolved once, so the tool component receives a stable object.
  const config = resolvePdfConfig(pdfOptions)

  return {
    // Must match the "name" field in package.json.
    name: PLUGIN_NAME,
    tools: [
      {
        name: name ?? 'skyneta11y-pdf-remediation',
        title: title ?? 'SkynetA11y PDF Remediation',
        icon: PluginIcon,
        component: function AiPdfRemediationTool() {
          return <PdfRemediationPage config={config} />
        },
      },
    ],
  }
})

export default AiPdfRemediation
