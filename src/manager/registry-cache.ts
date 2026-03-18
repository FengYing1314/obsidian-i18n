/**
 * 注册表缓存管理器
 * 负责缓存 registry.json 和 stats.json 到本地文件系统，减少重复网络请求
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import I18N from '../main';
import { RegistryItem, CommunityStatsData } from '../views/cloud/types';

/** 缓存条目结构 */
interface CacheEntry<T> {
    data: T;
    fetchedAt: number;  // 拉取时间戳(ms)
}

/** 默认缓存有效期: 24 小时 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/** 注册表仓库地址常量 */
export const REGISTRY_REPO = 'eondrcode/obsidian-i18n-resources';

/** 空统计数据的默认值 */
const EMPTY_STATS: CommunityStatsData = {
    repos: {},
    summary: { totalRepos: 0, totalPlugins: 0, totalTranslations: 0, totalContributors: 0, totalStars: 0, languageDistribution: {} },
    lastUpdated: new Date().toISOString(),
    leaderboard: { topReposByStars: [], topReposByActivity: [], topAuthors: [] }
};

export class RegistryCacheManager {
    private cacheDir: string;
    private i18n: I18N;

    constructor(i18n: I18N) {
        this.i18n = i18n;
        // @ts-ignore
        const basePath = this.i18n.app.vault.adapter.getBasePath();
        this.cacheDir = path.join(basePath, this.i18n.manifest.dir || '', 'cache');
        fs.ensureDirSync(this.cacheDir);
    }

    /**
     * 获取注册表数据（优先从缓存读取）
     */
    public async getRegistry(forceRefresh = false): Promise<RegistryItem[]> {
        return this.getCachedOrFetch<RegistryItem[]>(
            'registry.json',
            async () => {
                const [owner, repo] = REGISTRY_REPO.split('/');
                const res = await this.i18n.api.github.getFileContentWithFallback(owner, repo, 'registry.json');
                if (!res.state) throw new Error('Failed to fetch registry.json');
                return res.data;
            },
            forceRefresh
        );
    }

    /**
     * 获取统计数据（优先从缓存读取）
     */
    public async getStats(forceRefresh = false): Promise<CommunityStatsData> {
        try {
            return await this.getCachedOrFetch<CommunityStatsData>(
                'stats.json',
                async () => {
                    const [owner, repo] = REGISTRY_REPO.split('/');
                    const res = await this.i18n.api.github.getFileContentWithFallback(owner, repo, 'stats.json');
                    if (!res.state || !res.data) {
                        console.warn('[RegistryCache] Failed to fetch stats.json, using empty stats.');
                        return EMPTY_STATS;
                    }
                    return res.data;
                },
                forceRefresh
            );
        } catch {
            // stats 获取失败不阻塞流程，返回空数据
            console.warn('[RegistryCache] Stats fetch failed, using empty stats.');
            return EMPTY_STATS;
        }
    }

    /**
     * 清除所有缓存
     */
    public invalidate(): void {
        try {
            if (fs.existsSync(this.cacheDir)) {
                fs.emptyDirSync(this.cacheDir);
            }
            console.log('[RegistryCache] Cache invalidated.');
        } catch (e) {
            console.error('[RegistryCache] Failed to invalidate cache:', e);
        }
    }

    /**
     * 通用缓存或拉取逻辑
     */
    private async getCachedOrFetch<T>(
        filename: string,
        fetcher: () => Promise<T>,
        forceRefresh: boolean
    ): Promise<T> {
        const cachePath = path.join(this.cacheDir, filename);

        // 非强制刷新时，尝试读取缓存
        if (!forceRefresh && fs.existsSync(cachePath)) {
            try {
                const cached: CacheEntry<T> = fs.readJsonSync(cachePath);
                if (Date.now() - cached.fetchedAt < CACHE_TTL) {
                    console.log(`[RegistryCache] Using cached ${filename} (age: ${Math.round((Date.now() - cached.fetchedAt) / 60000)}min)`);
                    return cached.data;
                }
                console.log(`[RegistryCache] Cache expired for ${filename}, refetching...`);
            } catch {
                console.warn(`[RegistryCache] Failed to read cache for ${filename}, refetching...`);
            }
        }

        // 从网络拉取
        const data = await fetcher();

        // 写入缓存
        try {
            const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
            fs.writeJsonSync(cachePath, entry, { spaces: 2 });
            console.log(`[RegistryCache] Cached ${filename} successfully.`);
        } catch (e) {
            console.error(`[RegistryCache] Failed to write cache for ${filename}:`, e);
        }

        return data;
    }
}
