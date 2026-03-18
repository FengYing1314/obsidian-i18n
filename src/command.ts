import { App } from "obsidian";
import I18N from "./main";
import { MANAGER_VIEW_TYPE } from "./views/manager/manager-view";
import { t } from "./locales";

const commands = (app: App, i18n: I18N) => {
    i18n.addCommand({
        id: 'i18n-translate',
        name: t('command.open_panel'),
        callback: () => { i18n.view.activateView(MANAGER_VIEW_TYPE) }
    });

    i18n.addCommand({
        id: 'i18n-auto-manager',
        name: t('Manager.Tabs.AutoManagerTitle'),
        callback: () => {
            i18n.settings.managerTab = 'auto';
            i18n.saveSettings();
            i18n.view.activateView(MANAGER_VIEW_TYPE);
        }
    });
}

export default commands