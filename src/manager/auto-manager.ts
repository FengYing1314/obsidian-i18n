import I18N from '../main';
import { Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs-extra';
import { t } from '../locales';
import { RegistryItem, CommunityStatsData, ManifestEntry, getCloudFilePath } from '../views/cloud/types';
import { calculateChecksum } from '../utils/translator/translation';
import { TranslationSource, IState } from '../types';
import { RegistryCacheManager, REGISTRY_REPO } from './registry-cache';
import { useAutoStore } from '../views/manager/auto-store';

export class AutoManager {
    private i18n: I18N;
    private isRunning = false;
    private registryCache: RegistryCacheManager;

    constructor(i18n: I18N) {
        this.i18n = i18n;
        this.registryCache = new RegistryCacheManager(i18n);
    }


    /**
     * 自动模式启动入口
     */
    public async initialize() {
        // 1. 同步 Store 初始值
        this.syncStore();
    }

    /**
     * 同步设置到 Store
     */
    private syncStore() {
        const store = useAutoStore.getState();

        // 计算已应用翻译的插件/主题总数
        const plugins = this.i18n.stateManager.getAllPluginStates();
        const themes = this.i18n.stateManager.getAllThemeStates();
        const appliedCount = [...Object.values(plugins), ...Object.values(themes)].filter((s: IState) => s.isApplied).length;

        store.hydrate(this.i18n.settings, { appliedCount });
    }

    /**
     * 一键智能自动化处理
     */
    public async runSmartAuto(options: { silent?: boolean, isIncremental?: boolean } = {}) {
        const store = useAutoStore.getState();

        if (this.isRunning) {
            if (!options.silent) {
                new Notice(t('Manager.Status.Running'));
            }
            return;
        }

        const isSilent = options.silent || this.i18n.settings.autoSilentMode;

        this.isRunning = true;
        store.setStatus('running');
        store.clearAll();

        if (!isSilent) this.i18n.notice.info(t('Manager.Status.AutoStarting'));

        try {
            // 0. 验证版本状态（检测是否有插件已更新导致翻译失效）
            await this.i18n.stateManager.validateVersions(this.i18n.app);

            // 1. 安全检查：验证是否配置了受信任的翻译仓库源
            const trustedRepos = this.i18n.settings.autoTrustedRepos;
            if (!trustedRepos || trustedRepos.length === 0) {
                store.setStatus('error');
                if (!isSilent) {
                    this.i18n.notice.warning(t('Manager.Errors.NoTrustedRepos'));
                }
                return;
            }

            // 2. 获取社区注册表和统计数据（使用缓存管理器）
            const [registry, stats] = await Promise.all([
                this.registryCache.getRegistry(),
                this.registryCache.getStats(),
            ]);

            // 调试：显示获取到的总库数
            console.log('[AutoManager] Registry count:', registry.length);
            console.log('[AutoManager] Stats repos count:', Object.keys(stats.repos || {}).length);

            const installedPlugins = this.getInstalledPlugins();
            const installedThemes = await this.getInstalledThemes();
            let allInstalled = [...installedPlugins, ...installedThemes];

            // 增量更新逻辑：关注没被激活过的插件，或者版本号发生变动的插件
            if (options.isIncremental) {
                allInstalled = allInstalled.filter(item => {
                    const state = item.type === 'theme'
                        ? this.i18n.stateManager.getThemeState(item.id)
                        : this.i18n.stateManager.getPluginState(item.id);

                    // 情况1：从未应用过翻译
                    if (!state || !state.isApplied) return true;
                    // 情况2：已应用过翻译，但本地 manifest 版本与 state 记录的版本不一致（说明插件刚更新过）
                    if (item.version !== state.pluginVersion) return true;

                    return false;
                });

                if (allInstalled.length === 0) {
                    store.setStatus('success');
                    this.isRunning = false;
                    return;
                }
            }

            store.initTasks(allInstalled.map(item => ({
                id: item.id,
                type: item.type,
                name: item.id
            })));
            if (!isSilent) this.i18n.notice.info(t('Manager.Status.ScanningInstalled', { count: allInstalled.length }));

            // 3. 批量获取所有受信任仓库的元数据
            // 安全过滤：仅信任位于 autoTrustedRepos 列表内的仓库
            const trustedSet = new Set(trustedRepos);
            let relevantRepos = registry.filter(item => trustedSet.has(item.repoAddress));

            // 如果该阶段过滤后已为空，说明虽然用户配置了源，但该源在最新注册表中不存在或已下架
            if (relevantRepos.length === 0) {
                store.setStatus('error');
                if (!isSilent) this.i18n.notice.warning(t('Manager.Errors.TrustedRepoNotInRegistry'));
                return;
            }

            // 优化过滤逻辑：只针对关注的已安装插件进一步筛选
            relevantRepos = relevantRepos.filter(item => {
                const repoStats = stats.repos?.[item.repoAddress];
                if (!repoStats || !repoStats.pluginIds) return true; // 降级处理：如果没有统计数据，认为可能相关
                return allInstalled.some(installed => repoStats.pluginIds?.includes(installed.id));
            });

            // 如果基于插件过滤后为空，则代表至少尝试加载所有位于信任列表里的项
            if (relevantRepos.length === 0) {
                relevantRepos = registry.filter(item => trustedSet.has(item.repoAddress));
            }
            console.log('[AutoManager] Relevant repos count:', relevantRepos.length);

            const allManifests: { repoAddress: string; entry: ManifestEntry }[] = [];
            const BATCH_SIZE = 5;

            for (let i = 0; i < relevantRepos.length; i += BATCH_SIZE) {
                const batch = relevantRepos.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (item) => {
                    const [rOwner, rRepo] = item.repoAddress.split('/');
                    const manifestRes = await this.i18n.api.github.getFileContentWithFallback(rOwner, rRepo, 'metadata.json');
                    if (manifestRes.state && Array.isArray(manifestRes.data)) {
                        manifestRes.data.forEach((entry: ManifestEntry) => {
                            allManifests.push({ repoAddress: item.repoAddress, entry });
                        });
                    }
                }));

                // Add a small delay between batches to avoid rate limits
                if (i + BATCH_SIZE < relevantRepos.length) {
                    await new Promise(res => setTimeout(res, 500));
                }
            }

            console.log('[AutoManager] Total manifests fetched:', allManifests.length);
            if (!isSilent) this.i18n.notice.info(t('Manager.Status.ParsingEntries', { count: allManifests.length }));

            // 4. 为每个已安装项寻找最佳翻译
            let successCount = 0;
            let skipCount = 0;
            let upToDateCount = 0;
            let errorCount = 0;

            store.setProgress(0, allInstalled.length);
            let processedIndex = 0;

            for (const installed of allInstalled) {
                processedIndex++;
                store.setProgress(processedIndex, allInstalled.length);

                try {
                    store.updateTaskStatus(installed.id, 'processing');

                    const matches = allManifests.filter(m => m.entry.plugin === installed.id);
                    if (matches.length === 0) {
                        skipCount++;
                        store.updateTaskStatus(installed.id, 'skipped');
                        continue;
                    }

                    // 智能优选逻辑
                    const bestMatch = this.selectBestTranslation(
                        matches,
                        stats,
                        installed.version,
                        this.i18n.settings.language,
                        installed.type === 'theme'
                    );
                    if (bestMatch) {
                        // 如果关闭了自动应用，则仅标记为已找到并结束任务
                        if (!this.i18n.settings.autoApply) {
                            successCount++; // 统计为成功发现
                            store.updateTaskStatus(installed.id, 'found', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
                            continue;
                        }

                        // 优化：下载前先检查本地是否已有相同 Hash 的翻译
                        const existing = this.i18n.sourceManager.getSource(bestMatch.entry.id);
                        if (existing && existing.cloud?.hash === bestMatch.entry.hash) {
                            // 即使 Hash 一致，如果尚未应用，也需要尝试应用
                            const state = installed.type === 'theme' ? this.i18n.stateManager.getThemeState(installed.id) : this.i18n.stateManager.getPluginState(installed.id);
                            if (state?.isApplied &&
                                String(state?.translationVersion) === String(bestMatch.entry.version) &&
                                state?.pluginVersion === installed.version) {
                                store.updateTaskStatus(installed.id, 'success', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
                                upToDateCount++;
                                continue;
                            }
                            // 如果 Hash 一致但没应用，则直接进入应用阶段（跳过下载）
                            if (!isSilent) this.i18n.notice.info(t('Manager.Status.CacheHitApplying', { id: installed.id }), 1000);
                            // 必须先激活，injector 才能找到路径
                            this.i18n.sourceManager.setActive(bestMatch.entry.id, true);
                            const result = installed.type === 'theme'
                                ? await this.i18n.injectorManager.applyToTheme(installed.id)
                                : await this.i18n.injectorManager.applyToPlugin(installed.id);
                            if (result) {
                                successCount++;
                                store.updateTaskStatus(installed.id, 'success', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
                            } else {
                                errorCount++;
                                store.updateTaskStatus(installed.id, 'error', 'Cache apply failed');
                            }
                            continue;
                        }

                        if (!isSilent) this.i18n.notice.info(t('Manager.Status.DownloadingBest', { id: installed.id }), 2000);
                        const result = await this.applyTranslation(bestMatch, installed.type);
                        if (result) {
                            successCount++;
                            store.updateTaskStatus(installed.id, 'success', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
                            if (!isSilent) this.i18n.notice.success(t('Manager.Notices.ApplyPluginSuccess', { id: installed.id }), 3000);
                        } else {
                            errorCount++;
                            store.updateTaskStatus(installed.id, 'error', 'Download or injection failed');
                        }
                    } else {
                        skipCount++;
                        store.updateTaskStatus(installed.id, 'skipped');
                    }
                } catch (pluginError) {
                    if (pluginError.message === 'ROLLBACK_TRIGGERED') {
                        store.updateTaskStatus(installed.id, 'error', t('Manager.Status.AutoRollbacked'));
                        errorCount++;
                        continue;
                    }
                    console.error(`[autoManager] Failed to process ${installed.id}:`, pluginError);
                    store.updateTaskStatus(installed.id, 'error', pluginError.message || 'Unknown Error');
                    errorCount++;
                }
            }

            if (successCount === 0 && upToDateCount === 0 && errorCount === 0) {
                store.setStatus('success');
                if (!isSilent) this.i18n.notice.warning(t('Manager.Notices.NoMatchFound', { skip: skipCount }));
            } else {
                store.setStatus(errorCount > 0 ? 'error' : 'success');

                if (!isSilent) {
                    if (successCount > 0) {
                        this.i18n.notice.success(t('Manager.Notices.AutoApplied', { count: successCount }));
                    } else {
                        this.i18n.notice.success(t('Manager.Notices.AutoComplete', { success: successCount, upToDate: upToDateCount, error: errorCount, skip: skipCount }));
                    }
                }
            }

            // 更新最后检查时间
            this.i18n.settings.lastAutoCheckTime = Date.now();
            await this.i18n.saveSettings();

            // 完成后再次同步统计数据
            this.syncStore();
        } catch (error) {
            console.error('[AutoManager] Smart Auto failed:', error);
            store.setStatus('error');
            if (!isSilent) this.i18n.notice.error(`${t('Manager.Errors.AutoFailed')}: ${error.message || error}`);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 单个任务重试
     */
    public async retryTask(id: string, type: 'plugin' | 'theme') {
        const store = useAutoStore.getState();
        store.updateTaskStatus(id, 'processing');

        try {
            // 获取已安装版本
            let installedVersion = '0.0.0';
            let installedName = id;
            if (type === 'plugin') {
                const manifest = this.i18n.app.plugins.manifests[id];
                if (manifest) {
                    installedVersion = manifest.version;
                    installedName = manifest.name;
                }
            } else {
                const themes = await this.getInstalledThemes();
                const theme = themes.find(t => t.id === id);
                if (theme) {
                    installedVersion = theme.version;
                }
            }

            const [registry, stats] = await Promise.all([
                this.registryCache.getRegistry(),
                this.registryCache.getStats(),
            ]);

            const trustedRepos = this.i18n.settings.autoTrustedRepos;
            const trustedSet = new Set(trustedRepos || []);
            const relevantRepos = registry.filter(item => trustedSet.has(item.repoAddress));

            if (relevantRepos.length === 0) {
                store.updateTaskStatus(id, 'error', t('Manager.Errors.TrustedRepoNotInRegistry'));
                return;
            }

            const allManifests: { repoAddress: string; entry: ManifestEntry }[] = [];
            for (const item of relevantRepos) {
                const [rOwner, rRepo] = item.repoAddress.split('/');
                try {
                    const manifestRes = await this.i18n.api.github.getFileContentWithFallback(rOwner, rRepo, 'metadata.json');
                    if (manifestRes.state && Array.isArray(manifestRes.data)) {
                        manifestRes.data.forEach((entry: ManifestEntry) => {
                            allManifests.push({ repoAddress: item.repoAddress, entry });
                        });
                    }
                } catch (e) {
                    console.error('[AutoManager] Failed to fetch manifest for retry:', item.repoAddress);
                }
            }

            const matches = allManifests.filter(m => m.entry.plugin === id);
            if (matches.length === 0) {
                store.updateTaskStatus(id, 'skipped', 'No translation found');
                return;
            }

            const bestMatch = this.selectBestTranslation(
                matches,
                stats,
                installedVersion,
                this.i18n.settings.language,
                type === 'theme'
            );

            if (!bestMatch) {
                store.updateTaskStatus(id, 'skipped', 'No matching translation');
                return;
            }

            const existing = this.i18n.sourceManager.getSource(bestMatch.entry.id);
            if (existing && existing.cloud?.hash === bestMatch.entry.hash) {
                this.i18n.sourceManager.setActive(bestMatch.entry.id, true);
                const result = type === 'theme'
                    ? await this.i18n.injectorManager.applyToTheme(id)
                    : await this.i18n.injectorManager.applyToPlugin(id);
                if (result) {
                    store.updateTaskStatus(id, 'success', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
                } else {
                    store.updateTaskStatus(id, 'error', 'Injection failed from cache');
                }
                return;
            }

            const result = await this.applyTranslation(bestMatch, type);
            if (result) {
                store.updateTaskStatus(id, 'success', undefined, bestMatch.repoAddress, String(bestMatch.entry.version));
            } else {
                store.updateTaskStatus(id, 'error', 'Download or injection failed');
            }

        } catch (err: any) {
            console.error('[AutoManager] Retry failed for', id, err);
            store.updateTaskStatus(id, 'error', err.message === 'ROLLBACK_TRIGGERED' ? t('Manager.Status.AutoRollbacked') : (err.message || 'Unknown error'));
        }
    }

    /**
     * 手动清理注册表缓存
     */
    public invalidateCache() {
        this.registryCache.invalidate();
    }

    /**
     * 验证仓库是否有在云端注册或包含元数据
     */
    public async verifyRepo(repoStr: string): Promise<boolean> {
        try {
            const registry = await this.registryCache.getRegistry();
            const existsInRegistry = registry.some(item => item.repoAddress === repoStr);
            if (existsInRegistry) return true;

            const [owner, repo] = repoStr.split('/');
            const res = await this.i18n.api.github.getFileContentWithFallback(owner, repo, 'metadata.json');
            return res.state === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取已安装插件
     */
    private getInstalledPlugins() {
        const manifests = this.i18n.app.plugins.manifests;
        return Object.values(manifests)
            .filter((m: any) => m.id !== this.i18n.manifest.id)
            .map((m: any) => ({ id: m.id, version: m.version, type: 'plugin' as const }));
    }

    /**
     * 获取已安装主题
     */
    private async getInstalledThemes() {
        const themes: { id: string; version: string; type: 'theme' }[] = [];
        try {
            const exists = await this.i18n.app.vault.adapter.exists(`${this.i18n.app.vault.configDir}/themes`);
            if (exists) {
                const folders = await this.i18n.app.vault.adapter.list(`${this.i18n.app.vault.configDir}/themes`);
                for (const folder of folders.folders) {
                    const themeId = folder.split('/').pop();
                    if (themeId) {
                        let version = '0.0.0';
                        try {
                            const manifestPath = `${folder}/manifest.json`;
                            if (await this.i18n.app.vault.adapter.exists(manifestPath)) {
                                const manifestStr = await this.i18n.app.vault.adapter.read(manifestPath);
                                const manifest = JSON.parse(manifestStr);
                                if (manifest && manifest.version) {
                                    version = manifest.version;
                                }
                            }
                        } catch (e) { }
                        themes.push({ id: themeId, version, type: 'theme' });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch themes', e);
        }
        return themes;
    }

    /**
     * 简单的语义化版本兼容性检查
     * 格式示例: 1.2.3
     */
    private isVersionCompatible(cloudVersion: string, localVersion: string): number {
        if (cloudVersion === localVersion) return 100; // 完全匹配

        const cParts = cloudVersion.split('.').map(Number);
        const lParts = localVersion.split('.').map(Number);

        // 如果大版本相同，次版本兼容，给一定加分 (假定云端支持版本高于本地即可向下兼容，或者同等大版本通用)
        if (cParts[0] === lParts[0]) {
            return 50;
        }

        return 0;
    }

    /**
     * 智能优选算法
     */
    private selectBestTranslation(
        matches: { repoAddress: string; entry: ManifestEntry }[],
        stats: CommunityStatsData,
        targetVersion: string,
        targetLanguage: string,
        isTheme: boolean
    ) {
        // 1. 语言过滤 (优先完全匹配，找不到则放宽)
        let langMatches = matches.filter(m => m.entry.language === targetLanguage);
        if (langMatches.length === 0) {
            langMatches = matches;
        }

        // 2. 评分逻辑
        const scored = langMatches.map(m => {
            const repoStats = stats.repos[m.repoAddress];
            let score = 0;

            if (repoStats) {
                // 1. 星标权重 (0-100分)
                score += Math.min(repoStats.stars || 0, 100);
                // 2. 活跃度权重 (0-100分)
                score += (repoStats.activityScore || 0) * 100;
                // 3. 插件覆盖数权重 (0-20分)
                score += Math.min(repoStats.pluginCount || 0, 20);
            }

            // 4. 版本匹配权重
            if (isTheme) {
                // 主题没有提供版本解析，默认给一个过关分，避免被错误降级
                score += 50;
            } else {
                score += this.isVersionCompatible(m.entry.supported_versions, targetVersion);
            }

            return { ...m, score };
        });

        // 按分数降序排列
        scored.sort((a, b) => b.score - a.score);
        return scored[0];
    }

    /**
     * 下载并应用翻译
     */
    private async applyTranslation(
        match: { repoAddress: string; entry: ManifestEntry },
        type: 'plugin' | 'theme'
    ): Promise<boolean> {
        const [owner, repo] = match.repoAddress.split('/');
        const filePath = getCloudFilePath(match.entry.id, type);

        try {
            const res = await this.i18n.api.github.getFileContentWithFallback(owner, repo, filePath);
            if (!res.state || !res.data) return false;

            const content = res.data;
            const manager = this.i18n.sourceManager;

            // 1. 检查本地是否已有同 ID 翻译
            const existing = manager.getSource(match.entry.id);

            // 2. 自动备份 (如果存在且不同)
            if (existing) {
                this.i18n.backupManager.backupTranslationSync(existing.id, manager.sourcesDir);
            }

            // 3. 保存文件
            manager.saveSourceFile(match.entry.id, content);

            // 4. 更新元数据
            const sourceInfo: TranslationSource = {
                id: match.entry.id,
                plugin: match.entry.plugin,
                title: match.entry.title,
                type: match.entry.type,
                origin: 'cloud',
                isActive: true, // 自动化流程默认激活
                checksum: calculateChecksum(content),
                cloud: {
                    owner,
                    repo,
                    hash: match.entry.hash,
                },
                updatedAt: Date.now(),
                createdAt: existing?.createdAt || Date.now(),
            };

            // 设置激活（自动取消同插件其他激活）
            manager.saveSource(sourceInfo);
            manager.setActive(match.entry.id, true);

            // 5. 核心追加：立即应用（注入）翻译到插件或主题
            const injectSuccess = type === 'theme'
                ? await this.i18n.injectorManager.applyToTheme(match.entry.plugin)
                : await this.i18n.injectorManager.applyToPlugin(match.entry.plugin);

            return injectSuccess;
        } catch (error) {
            console.error(`Failed to apply translation for ${match.entry.plugin}:`, error);
            return false;
        }
    }
}
