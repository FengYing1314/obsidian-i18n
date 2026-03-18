import BaseSetting from "../base-setting";
import { Setting } from "obsidian";
import { SUPPORTED_LANGUAGES } from '@/src/constants/languages';
import { t } from "src/locales";

export default class I18nBasis extends BaseSetting {
    main(): void {
        const headerClass = 'mt-6 mb-3 text-emerald-600 font-bold border-b border-emerald-600/10 pb-1.5 px-1';

        // 1. 检查更新 (Section 1)
        this.containerEl.createEl('h3', { text: t('Settings.Basis.HeaderUpdate'), cls: headerClass });

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.UpdateTitle'))
            .setDesc(t('Settings.Basis.UpdateDesc'))
            .addButton(cb => {
                cb.setButtonText(t('Settings.Basis.UpdateBtn'))
                    .onClick(async () => {
                        await this.i18n.coreManager.applyUpdate();
                        this.settingTab.basisDisplay();
                    });
                if (!this.i18n.coreManager.updatesMark) {
                    cb.buttonEl.style.display = 'none';
                }
            })
            .addToggle(cb => cb
                .setValue(this.settings.checkUpdates)
                .onChange(async () => {
                    this.settings.checkUpdates = !this.settings.checkUpdates;
                    await this.i18n.saveSettings();
                    if (this.settings.checkUpdates) {
                        await this.i18n.coreManager.checkUpdates(true);
                    } else {
                        this.i18n.coreManager.updatesMark = false;
                        this.i18n.coreManager.updatesVersion = '';
                    }
                    this.settingTab.basisDisplay();
                })
            );

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.SmartUpdateTitle'))
            .setDesc(t('Settings.Basis.SmartUpdateDesc'))
            .addToggle((cb) =>
                cb
                    .setValue(this.settings.automaticUpdate)
                    .onChange(async (value) => {
                        this.settings.automaticUpdate = value;
                        await this.i18n.saveSettings();
                    })
            );

        // 2. 基础配置 (Section 2)
        this.containerEl.createEl('h3', { text: t('Settings.Basis.HeaderBasis'), cls: headerClass });

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.LangTitle'))
            .setDesc(t('Settings.Basis.LangDesc'))
            .addDropdown(cb => cb
                .addOptions(
                    Object.fromEntries(SUPPORTED_LANGUAGES.map(lang => [lang.value, lang.label]))
                )
                .setValue(this.settings.language)
                .onChange(async (value) => {
                    this.settings.language = value;
                    await this.i18n.saveSettings();
                })
            );

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.AutoSaveTitle'))
            .setDesc(t('Settings.Basis.AutoSaveDesc'))
            .addToggle((cb) =>
                cb
                    .setValue(this.settings.autoSave)
                    .onChange(async (value) => {
                        this.settings.autoSave = value;
                        await this.i18n.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.AuthorTitle'))
            .setDesc(t('Settings.Basis.AuthorDesc'))
            .addText(cb => cb
                .setPlaceholder(t('Settings.Basis.AuthorPlaceholder'))
                .setValue(this.settings.author)
                .onChange(async (value) => {
                    this.settings.author = value;
                    await this.i18n.saveSettings();
                })
            );

        // 3. 自动化任务 (Section 3 - Merged from i18n-auto.ts)
        this.containerEl.createEl('h3', { text: t('Settings.Basis.HeaderAuto'), cls: headerClass });

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.AutoApplyTitle'))
            .setDesc(t('Settings.Basis.AutoApplyDesc'))
            .addToggle(cb => cb
                .setValue(this.settings.autoApply)
                .onChange(async (value) => {
                    this.settings.autoApply = value;
                    await this.i18n.saveSettings();
                })
            );

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.AutoSilentTitle'))
            .setDesc(t('Settings.Basis.AutoSilentDesc'))
            .addToggle(cb => cb
                .setValue(this.settings.autoSilentMode)
                .onChange(async (value) => {
                    this.settings.autoSilentMode = value;
                    await this.i18n.saveSettings();
                })
            );

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.AutoTrustedReposTitle'))
            .setDesc(t('Settings.Basis.AutoTrustedReposDesc'))
            .addTextArea(cb => cb
                .setPlaceholder(t('Settings.Basis.AutoTrustedReposPlaceholder'))
                .setValue(this.settings.autoTrustedRepos.join('\n'))
                .onChange(async (value) => {
                    this.settings.autoTrustedRepos = value.split('\n').map(v => v.trim()).filter(v => v.length > 0);
                    await this.i18n.saveSettings();
                })
            );

        // 4. 外部链接 (Section 4)
        this.containerEl.createEl('h3', { text: t('Settings.Basis.HeaderExternal'), cls: headerClass });

        new Setting(this.containerEl)
            .setName(t('Settings.Basis.ManagerTitle'))
            .setDesc(t('Settings.Basis.ManagerDesc'))
            .addButton((cb) => {
                cb.setButtonText(t('Settings.Basis.ManagerBtn'))
                    .onClick(() => {
                        window.open('https://github.com/eondrcode/obsidian-manager');
                    });
            });

    }
}
