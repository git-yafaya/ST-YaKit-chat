import business from './business.js';
import { initPanelUI } from './ui/panel/index.js';

export * from './business.js';

globalThis.YaKitChat = Object.freeze({
    version: '0.8.7',
    ...business.api,
});

if (typeof document !== 'undefined') {
    initPanelUI(globalThis.YaKitChat, business.getContext);
}
