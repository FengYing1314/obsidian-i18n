import React, { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import I18N from 'src/main';
import { useCloudStore } from '../../cloud/cloud-store';
import { LeaderboardAuthorEntry, CommunityRepoStats, ContributorEntry, ContributorCategory } from '../../cloud/types';
import { ScrollArea, Badge, Separator } from '~/shadcn';
import { cn } from '~/shadcn/lib/utils';
import {
    Star, Globe, ExternalLink, Heart, Sparkles, Award, Users,
    Loader2, Code, Video, MessageSquare, TestTube, ChevronDown,
    GitFork
} from 'lucide-react';

// ========== 可扩展的类别定义 ==========
interface CreditCategory {
    id: string;
    icon: React.ReactNode;
    colorFrom: string;
    colorTo: string;
    ringColor: string;
    badgeColor: string;
}

interface CreditsPanelProps {
    i18n: I18N;
}

/** 获取贡献者头像 URL：优先 avatarUrl，其次 GitHub 用户名自动生成 */
function resolveAvatarUrl(entry: { avatarUrl?: string; githubUsername?: string }): string | undefined {
    if (entry.avatarUrl) return entry.avatarUrl;
    if (entry.githubUsername) return `https://github.com/${entry.githubUsername}.png?size=80`;
    return undefined;
}

// ========== 主面板 ==========
export const CreditsPanel: React.FC<CreditsPanelProps> = ({ i18n }) => {
    const { t } = useTranslation();

    // 云端数据
    const communityStats = useCloudStore.use.communityStats();
    const communityRegistry = useCloudStore.use.communityRegistry();
    const communityLoaded = useCloudStore.use.communityLoaded();
    const fetchCommunityRegistry = useCloudStore.use.fetchCommunityRegistry();

    // 贡献者数据
    const contributors = useCloudStore.use.contributors();
    const contributorsLoaded = useCloudStore.use.contributorsLoaded();
    const fetchContributors = useCloudStore.use.fetchContributors();

    useEffect(() => {
        if (!communityLoaded) fetchCommunityRegistry(i18n);
        if (!contributorsLoaded) fetchContributors(i18n);
    }, [communityLoaded, contributorsLoaded, fetchCommunityRegistry, fetchContributors, i18n]);

    // 构建作者勋章映射
    const authorBadgeMap = useMemo(() => {
        const map: Record<string, string> = {};
        if (!communityRegistry) return map;
        for (const item of communityRegistry) {
            const owner = item.repoAddress?.split('/')[0];
            if (item.authorBadge && owner) {
                map[owner] = item.authorBadge;
            }
        }
        return map;
    }, [communityRegistry]);

    // 云端社区创作者
    const cloudCreators = useMemo(() => {
        const leaders = communityStats?.leaderboard?.topAuthors || [];
        if (leaders.length > 0) return leaders;
        if (!communityStats?.repos) return [];
        const map = new Map<string, LeaderboardAuthorEntry>();
        Object.values(communityStats.repos).forEach((stats: CommunityRepoStats) => {
            if (!map.has(stats.authorName)) {
                map.set(stats.authorName, {
                    name: stats.authorName,
                    avatarUrl: stats.avatarUrl,
                    htmlUrl: stats.authorHtmlUrl,
                    totalPlugins: stats.pluginCount,
                    totalStars: stats.stars,
                    repoCount: 1,
                    languages: stats.languages || [],
                    activityScore: stats.activityScore,
                    lastActiveAt: stats.lastPushedAt,
                });
            } else {
                const existing = map.get(stats.authorName)!;
                existing.totalPlugins += stats.pluginCount;
                existing.totalStars += stats.stars;
                existing.repoCount += 1;
            }
        });
        return Array.from(map.values()).sort((a, b) => b.totalStars - a.totalStars);
    }, [communityStats]);

    // ========== 类别配置（模块级常量通过闭包引用） ==========
    const categories: CreditCategory[] = useMemo(() => [
        {
            id: 'sponsor',
            icon: <Award className="w-4 h-4" />,
            colorFrom: 'from-fuchsia-500/15',
            colorTo: 'to-purple-500/10',
            ringColor: 'ring-fuchsia-500/30',
            badgeColor: 'bg-fuchsia-500/15 text-fuchsia-600',
        },
        {
            id: 'translation',
            icon: <Globe className="w-4 h-4" />,
            colorFrom: 'from-blue-500/10',
            colorTo: 'to-cyan-500/5',
            ringColor: 'ring-blue-500/20',
            badgeColor: 'bg-blue-500/10 text-blue-600',
        },
        {
            id: 'code',
            icon: <Code className="w-4 h-4" />,
            colorFrom: 'from-emerald-500/10',
            colorTo: 'to-green-500/5',
            ringColor: 'ring-emerald-500/20',
            badgeColor: 'bg-emerald-500/10 text-emerald-600',
        },
        {
            id: 'video',
            icon: <Video className="w-4 h-4" />,
            colorFrom: 'from-rose-500/10',
            colorTo: 'to-pink-500/5',
            ringColor: 'ring-rose-500/20',
            badgeColor: 'bg-rose-500/10 text-rose-600',
        },
        {
            id: 'testing',
            icon: <TestTube className="w-4 h-4" />,
            colorFrom: 'from-amber-500/10',
            colorTo: 'to-yellow-500/5',
            ringColor: 'ring-amber-500/20',
            badgeColor: 'bg-amber-500/10 text-amber-600',
        },
        {
            id: 'suggestion',
            icon: <MessageSquare className="w-4 h-4" />,
            colorFrom: 'from-violet-500/10',
            colorTo: 'to-purple-500/5',
            ringColor: 'ring-violet-500/20',
            badgeColor: 'bg-violet-500/10 text-violet-600',
        },
    ], []);

    // 将远程贡献者按类别分组
    const contributorsByCategory = useMemo(() => {
        const map: Record<string, ContributorEntry[]> = {
            sponsor: [], code: [], video: [], testing: [], suggestion: [],
        };
        for (const c of contributors) {
            if (map[c.category]) map[c.category].push(c);
        }
        return map;
    }, [contributors]);

    // 加载中状态
    if (!communityLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                <p className="text-sm">{t('Common.Status.Loading')}</p>
            </div>
        );
    }

    return (
        <ScrollArea className="flex-1 min-h-0 w-full h-full">
            <div className="max-w-3xl mx-auto px-6 py-8">
                {/* 顶部标题区 */}
                <div className="text-center mb-8 relative">
                    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent rounded-3xl blur-3xl" />
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 via-orange-400/10 to-rose-400/20 border border-amber-500/10 mb-4 shadow-lg shadow-amber-500/5">
                        <Heart className="w-7 h-7 text-amber-500" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight mb-1.5">{t('Manager.Credits.Title')}</h2>
                    <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto leading-relaxed">
                        {t('Manager.Credits.Subtitle')}
                    </p>
                </div>

                {/* 各类别板块 */}
                <div className="space-y-6">
                    {/* 爱发电赞助者 - 从 contributors.json 加载并置顶 */}
                    {(() => {
                        const sponsorCat = categories[0];
                        const sponsorEntries = contributorsByCategory[sponsorCat.id] || [];
                        return (
                            <CategorySection
                                key={sponsorCat.id}
                                category={sponsorCat}
                                title={t(`Manager.Credits.CatSponsor`)}
                                subtitle={t(`Manager.Credits.CatSponsorDesc`)}
                                count={sponsorEntries.length}
                                t={t}
                                defaultOpen={true}
                            >
                                {sponsorEntries.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {sponsorEntries.map((c) => (
                                            <ContributorCard key={`${c.category}-${c.name}`} contributor={c} category={sponsorCat} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-xs text-muted-foreground/40 italic">
                                        {t('Manager.Credits.ComingSoon')}
                                    </div>
                                )}
                            </CategorySection>
                        );
                    })()}

                    {/* 翻译贡献者 - 从云端社区数据拉取 */}
                    <CategorySection
                        category={categories[1]}
                        title={t('Manager.Credits.CatTranslation')}
                        subtitle={t('Manager.Credits.CatTranslationDesc')}
                        count={cloudCreators.length}
                        t={t}
                        defaultOpen={true}
                    >
                        {cloudCreators.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {cloudCreators.map((creator, index) => (
                                    <CloudCreatorCard
                                        key={creator.name}
                                        creator={creator}
                                        rank={index + 1}
                                        badge={authorBadgeMap[creator.name]}
                                        category={categories[1]}
                                        t={t}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-xs text-muted-foreground/40 italic">
                                {t('Manager.Credits.ComingSoon')}
                            </div>
                        )}
                    </CategorySection>

                    {/* 其他类别 – 从 contributors.json 加载 */}
                    {categories.slice(2).map((cat) => {
                        const entries = contributorsByCategory[cat.id] || [];
                        return (
                            <CategorySection
                                key={cat.id}
                                category={cat}
                                title={t(`Manager.Credits.Cat${capitalize(cat.id)}` as any)}
                                subtitle={t(`Manager.Credits.Cat${capitalize(cat.id)}Desc` as any)}
                                count={entries.length}
                                t={t}
                                defaultOpen={entries.length > 0}
                            >
                                {entries.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {entries.map((c) => (
                                            <ContributorCard key={`${c.category}-${c.name}`} contributor={c} category={cat} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-xs text-muted-foreground/40 italic">
                                        {t('Manager.Credits.ComingSoon')}
                                    </div>
                                )}
                            </CategorySection>
                        );
                    })}
                </div>

                {/* 底部 */}
                <div className="text-center mt-10 pb-4">
                    <div className="inline-flex items-center gap-2 text-[10px] text-muted-foreground/40 px-4 py-2 rounded-full bg-muted/15 border border-border/15">
                        <Sparkles className="w-3 h-3" />
                        {t('Manager.Credits.Footer')}
                    </div>
                </div>
            </div>
        </ScrollArea>
    );
};

// ========== 分类折叠区段 ==========
interface CategorySectionProps {
    category: CreditCategory;
    title: string;
    subtitle: string;
    count: number;
    t: any;
    defaultOpen: boolean;
    children: React.ReactNode;
}

const CategorySection: React.FC<CategorySectionProps> = ({
    category, title, subtitle, count, t, defaultOpen, children
}) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={cn(
            "rounded-xl border overflow-hidden transition-all duration-300",
            "bg-gradient-to-br",
            category.colorFrom,
            category.colorTo,
            "border-border/30"
        )}>
            <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                onClick={() => setOpen(!open)}
            >
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                    category.badgeColor
                )}>
                    {category.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-foreground">{title}</span>
                        {count > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono">
                                {count}
                            </Badge>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{subtitle}</p>
                </div>
                <ChevronDown className={cn(
                    "w-4 h-4 text-muted-foreground/40 transition-transform duration-200 shrink-0",
                    open ? "rotate-0" : "-rotate-90"
                )} />
            </button>
            {open && (
                <div className="px-4 pb-4 pt-1">
                    {children}
                </div>
            )}
        </div>
    );
};

// ========== 云端翻译创作者卡片 ==========
interface CloudCreatorCardProps {
    creator: LeaderboardAuthorEntry;
    rank: number;
    badge?: string;
    category: CreditCategory;
    t: any;
}

const CloudCreatorCard: React.FC<CloudCreatorCardProps> = ({ creator, rank, badge, category, t }) => {
    const isTop = rank <= 3;
    return (
        <div
            className={cn(
                "group relative flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer select-none",
                "bg-background/60 backdrop-blur-sm hover:bg-background/90 hover:shadow-sm hover:-translate-y-px",
                isTop ? "border-amber-500/15" : "border-border/30"
            )}
            onClick={() => creator.htmlUrl && window.open(creator.htmlUrl, '_blank')}
        >
            {isTop && (
                <div className="absolute -top-1.5 -right-1.5 z-10">
                    <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shadow-sm",
                        rank === 1 ? "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20" :
                            rank === 2 ? "bg-slate-400/15 text-slate-500 ring-1 ring-slate-400/20" :
                                "bg-orange-500/15 text-orange-600 ring-1 ring-orange-500/20"
                    )}>
                        {rank}
                    </div>
                </div>
            )}
            {creator.avatarUrl ? (
                <img src={creator.avatarUrl} alt={creator.name}
                    className={cn("w-9 h-9 rounded-lg ring-1 shrink-0 transition-transform group-hover:scale-105", category.ringColor)} />
            ) : (
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", category.badgeColor)}>
                    {creator.name.charAt(0).toUpperCase()}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12px] font-bold text-foreground truncate">{creator.name}</span>
                    {badge && (
                        <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 font-bold shrink-0">
                            <Award className="w-2 h-2 mr-0.5" />{badge}
                        </Badge>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
                </div>
                <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground/50">
                    <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5 text-amber-500/40" />{creator.totalStars}</span>
                    <span className="flex items-center gap-0.5"><GitFork className="w-2.5 h-2.5" />{creator.repoCount} {t('Manager.Credits.UnitRepos')}</span>
                    <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />{creator.totalPlugins} {t('Manager.Credits.UnitPlugins')}</span>
                </div>
            </div>
        </div>
    );
};

// ========== 通用贡献者卡片（从 contributors.json 加载） ==========
interface ContributorCardProps {
    contributor: ContributorEntry;
    category: CreditCategory;
}

const ContributorCard: React.FC<ContributorCardProps> = ({ contributor, category }) => {
    const avatar = resolveAvatarUrl(contributor);
    return (
        <div
            className={cn(
                "group flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 select-none",
                "bg-background/60 backdrop-blur-sm hover:bg-background/90 hover:shadow-sm",
                contributor.url ? "cursor-pointer hover:-translate-y-px" : "",
                "border-border/30"
            )}
            onClick={() => contributor.url && window.open(contributor.url, '_blank')}
        >
            {avatar ? (
                <img src={avatar} alt={contributor.name}
                    className={cn("w-9 h-9 rounded-lg ring-1 shrink-0", category.ringColor)} />
            ) : (
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", category.badgeColor)}>
                    {contributor.name.charAt(0).toUpperCase()}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <span className="text-[12px] font-bold text-foreground truncate block">{contributor.name}</span>
                {contributor.description && (
                    <span className="text-[10px] text-muted-foreground/50 truncate block">{contributor.description}</span>
                )}
            </div>
            {contributor.url && (
                <ExternalLink className="w-3 h-3 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
        </div>
    );
};

// 工具函数
function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

