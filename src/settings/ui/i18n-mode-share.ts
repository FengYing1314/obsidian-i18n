import { Setting, Notice } from "obsidian";
import BaseSetting from "../base-setting";
import { t } from "src/locales";
import { GitHubAPI } from "src/api/github";
import { useCloudStore } from "src/views/cloud/cloud-store";

// ==============================
//           个人云端同步
// ==============================
export default class I18nShare extends BaseSetting {
    main(): void {
        const { containerEl } = this;
        containerEl.empty();

        if (!this.settings.shareProfiles) {
            this.settings.shareProfiles = [];
        }

        // 迁移旧数据/自启动至少一个账号方案
        if (this.settings.shareProfiles.length === 0) {
            const id = Date.now().toString();
            this.settings.shareProfiles.push({
                id,
                name: '默认账号',
                token: this.settings.shareToken || '',
                repo: this.settings.shareRepo || 'obsidian-translations'
            });
            this.settings.shareActiveProfileId = id;
            this.i18n.saveSettings();
        }

        const activeProfile = this.settings.shareProfiles.find(p => p.id === this.settings.shareActiveProfileId);

        // ==============================
        //        0. 获取访问令牌
        // ==============================
        containerEl.createEl('h2', { text: t('Settings.Share.TutorialTitle') });

        new Setting(containerEl)
            .setDesc(t('Settings.Share.TutorialTip'))
            .addButton(btn => btn
                .setButtonText('Classic Token (自动勾选)')
                .setTooltip('自动配置并勾选全量 repo 权限，操作最便捷')
                .onClick(() => {
                    window.open('https://github.com/settings/tokens/new?scopes=repo&description=Obsidian-i18n-Share');
                })
            )
            .addButton(btn => btn
                .setButtonText('Fine-grained Token (需手动)')
                .setTooltip('更安全的细粒度权限。前提：需手动选择"All repositories"并开启 Contents 的读写权')
                .onClick(() => {
                    window.open('https://github.com/settings/personal-access-tokens/new?name=Obsidian-i18n-Share&description=Obsidian-i18n+Translation+Sync');
                })
            );

        // ==============================
        //        1. 身份验证 & 账号管理
        // ==============================
        containerEl.createEl('h2', { text: t('Settings.Share.AuthTitle') });

        // -- 账号切换 Dropdown --
        const profileHeader = new Setting(containerEl)
            .setName(t('Settings.Share.ProfileSelectTitle'))
            .setDesc(t('Settings.Share.ProfileSelectDesc'));

        profileHeader.addDropdown(dropdown => {
            this.settings.shareProfiles.forEach(p => {
                dropdown.addOption(p.id, p.name);
            });
            dropdown.setValue(this.settings.shareActiveProfileId);
            dropdown.onChange(async (value) => {
                this.settings.shareActiveProfileId = value;
                const profile = this.settings.shareProfiles.find(p => p.id === value);
                if (profile) {
                    this.settings.shareToken = profile.token;
                    this.settings.shareRepo = profile.repo;
                    // 切换账号时重置云端状态并更新 UI
                    useCloudStore.getState().reset();
                    useCloudStore.getState().setRepoNameInput(profile.repo);
                }
                await this.i18n.saveSettings();
                this.display(); // 刷新界面
            });
        });

        // 新增方案
        profileHeader.addButton(btn => {
            btn.setIcon('plus')
                .setTooltip(t('Settings.Share.ProfileAddBtn'))
                .onClick(async () => {
                    const id = Date.now().toString();
                    const newProfile = {
                        id,
                        name: `${t('Settings.Share.ProfileAddBtn')} ${this.settings.shareProfiles.length + 1}`,
                        token: '',
                        repo: 'obsidian-translations'
                    };
                    this.settings.shareProfiles.push(newProfile);
                    this.settings.shareActiveProfileId = id;
                    this.settings.shareToken = newProfile.token;
                    this.settings.shareRepo = newProfile.repo;

                    useCloudStore.getState().reset();
                    useCloudStore.getState().setRepoNameInput(newProfile.repo);

                    await this.i18n.saveSettings();
                    new Notice(t('Settings.Share.ProfileAddNotice'));
                    this.display();
                });
        });

        // 删除方案
        profileHeader.addButton(btn => {
            btn.setIcon('trash')
                .setTooltip(t('Settings.Share.ProfileDelBtn'))
                .onClick(async () => {
                    if (this.settings.shareProfiles.length <= 1) {
                        new Notice("Cannot delete the last profile");
                        return;
                    }
                    if (!confirm(t('Settings.Share.ProfileDelConfirm'))) return;

                    const activeId = this.settings.shareActiveProfileId;
                    this.settings.shareProfiles = this.settings.shareProfiles.filter(p => p.id !== activeId);

                    // 激活第一个
                    const nextProfile = this.settings.shareProfiles[0];
                    this.settings.shareActiveProfileId = nextProfile.id;
                    this.settings.shareToken = nextProfile.token;
                    this.settings.shareRepo = nextProfile.repo;

                    useCloudStore.getState().reset();
                    useCloudStore.getState().setRepoNameInput(nextProfile.repo);

                    await this.i18n.saveSettings();
                    this.display();
                });
        });

        // 方案名称修改
        if (activeProfile) {
            new Setting(containerEl)
                .setName(t('Settings.Share.ProfileNameTitle'))
                .setDesc(t('Settings.Share.ProfileNameDesc'))
                .addText(text => text
                    .setValue(activeProfile.name)
                    .setPlaceholder(t('Settings.Share.ProfileNamePlaceholder'))
                    .onChange(async (value) => {
                        const val = value.trim();
                        if (val && val !== activeProfile.name) {
                            activeProfile.name = val;
                            await this.i18n.saveSettings();
                        }
                    })
                );
        }

        // -- Access Token 配置 --
        const tokenSetting = new Setting(containerEl)
            .setName(t('Settings.Share.ModeTitle'))
            .setDesc(this.settings.shareToken ? `${t('Settings.Share.LoginSuccess')}` : t('Settings.Share.ModeDesc'));

        tokenSetting.addText(text => {
            text.setValue(this.settings.shareToken)
                .setPlaceholder(t('Settings.Share.TokenPlaceholder'))
                .onChange(async (value) => {
                    const val = value.trim();
                    this.settings.shareToken = val;
                    if (activeProfile) activeProfile.token = val;
                    await this.i18n.saveSettings();
                });

            // 失焦触发静默验证
            text.inputEl.addEventListener('blur', async () => {
                const token = this.settings.shareToken;
                if (!token) return;

                tokenSetting.setDesc(t('Settings.Share.Verifying'));

                try {
                    const github = new GitHubAPI(this.i18n);
                    const res = await github.getUser();

                    if (res.state) {
                        const scopes = res.scopes || [];
                        const hasRepoScope = scopes.includes('public_repo') || scopes.includes('repo');
                        const isFineGrained = token.startsWith('github_pat_');

                        if (hasRepoScope || isFineGrained) {
                            tokenSetting.setDesc(`${t('Settings.Share.LoginSuccess')}: @${res.data.login}`);
                            useCloudStore.getState().reset();
                        } else {
                            throw new Error(t('Settings.Share.VerifyInsufficient'));
                        }
                    } else {
                        throw new Error(t('Settings.Share.VerifyError'));
                    }
                } catch (e) {
                    new Notice(e.message || t('Settings.Share.VerifyError'));
                    this.settings.shareToken = '';
                    if (activeProfile) activeProfile.token = '';
                    await this.i18n.saveSettings();
                    text.setValue('');
                    tokenSetting.setDesc(t('Settings.Share.ModeDesc'));
                }
            });
        });
        // -- 目标仓库配置 (随账号切换) --
        new Setting(containerEl)
            .setName(t('Settings.Share.RepoTitle'))
            .setDesc(t('Settings.Share.RepoDesc'))
            .addText(text => {
                text.setValue(this.settings.shareRepo || 'obsidian-translations')
                    .setPlaceholder('obsidian-translations')
                    .onChange(async (value) => {
                        const trimmedValue = value.trim();
                        this.settings.shareRepo = trimmedValue;
                        if (activeProfile) activeProfile.repo = trimmedValue;
                        await this.i18n.saveSettings();
                        useCloudStore.getState().setRepoNameInput(trimmedValue);
                    });
            });


    }
}
