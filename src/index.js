import business from './business.js';
import { initPanelUI } from './ui/panel/index.js';

export * from './business.js';

globalThis.YaKitChat = Object.freeze({
    version: '1.0.1',
    ...business.api,
});

if (typeof document !== 'undefined') {
    initPanelUI(globalThis.YaKitChat, business.getContext);
}
