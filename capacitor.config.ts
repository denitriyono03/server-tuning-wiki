import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'id.denitriyono03.servertuning',
  appName: 'Server Tuning Wiki',
  webDir: 'dist/server-tuning-wiki/browser',
  // WebView memakai skema https supaya fetch API & localStorage jalan normal.
  server: {
    androidScheme: 'https',
  },
}

export default config
