import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.coachai.app',
    appName: 'Coach AI',
    webDir: 'dist',
    android: {
        buildOptions: {
            signingType: 'apksigner'
        }
    }
};

export default config;
