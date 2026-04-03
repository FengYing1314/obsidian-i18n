import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoStore, AutoTaskStatus, AutoTaskItem } from '../auto-store';
import {
    Loader2, CheckCircle2, AlertCircle, RefreshCw, Play, Package,
    Palette, Zap, LayoutList, Settings2, Globe, Plus, Trash2,
    Monitor, MousePointer2, Info, ChevronRight
} from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input } from '~/shadcn';
import { cn } from '~/shadcn/lib/utils';
import I18N from 'src/main';
import { moment } from 'obsidian';

interface AutoManagerPanelProps {
    i18n: I18N;
}

export const AutoManagerPanel: React.FC<AutoManagerPanelProps> = ({ i18n }) => {
    const { t } = useTranslation();
    const {
        status, progress, tasks, summary, clearAll,
        trustedRepos, addTrustedRepo, removeTrustedRepo,
        autoApply, autoSilentMode, filterStatus, setFilterStatus, setConfigs
    } = useAutoStore();

    const [mode, setMode] = useState<'incremental' | 'full'>('incremental');
    const [newRepo, setNewRepo] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleStart = async () => {
        if (status === 'running') return;
        clearAll();
        // 设置状态为运行中，避免重复触发
        useAutoStore.getState().setStatus('running');
        await i18n.autoManager.runSmartAuto({
            silent: true,
            isIncremental: mode === 'incremental'
        });
    };

    const handleAddRepo = async () => {
        const repoStr = newRepo.trim();
        if (!repoStr || !repoStr.includes('/')) {
            i18n.notice.warning('格式错误：请输入 owner/repo 格式');
            return;
        }
        if (trustedRepos.includes(repoStr)) {
            setNewRepo('');
            return;
        }

        setIsAdding(true);
        const isValid = await i18n.autoManager.verifyRepo(repoStr);
        setIsAdding(false);

        if (!isValid) {
            i18n.notice.error('添加失败：未在社区找到该仓库，且其不包含有效的 metadata.json');
            return;
        }

        const repos = [...trustedRepos, repoStr];
        i18n.settings.autoTrustedRepos = repos;
        await i18n.saveSettings();
        addTrustedRepo(repoStr);
        setNewRepo('');
        i18n.notice.success('添加受信任仓库成功');
    };

    const handleRemoveRepo = async (repo: string) => {
        const repos = trustedRepos.filter(r => r !== repo);
        i18n.settings.autoTrustedRepos = repos;
        await i18n.saveSettings();
        removeTrustedRepo(repo);
    };

    const toggleConfig = async (key: 'autoApply' | 'autoSilentMode') => {
        // @ts-ignore
        const newVal = !i18n.settings[key];
        // @ts-ignore
        i18n.settings[key] = newVal;
        await i18n.saveSettings();
        setConfigs({ [key]: newVal });
    };

    return (
        <div className="flex h-full bg-background overflow-hidden animate-in fade-in duration-500">
            {/* 左侧主要内容区 */}
            <div className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6">
                {/* 顶部标题与主要操作 */}
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <div className="w-2 h-8 bg-amber-500 rounded-full mr-1" />
                            {t('Manager.Auto.TabName')}
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {t('Manager.Auto.Desc')}
                        </p>
                        {i18n.settings.lastAutoCheckTime > 0 && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 font-medium">
                                <RefreshCw className="w-3.5 h-3.5" />
                                {t('Manager.Auto.Stats.LastCheckTime', { time: moment(i18n.settings.lastAutoCheckTime).fromNow() })}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-3 bg-muted/30 p-1.5 rounded-xl border border-border/50">
                        <Select value={mode} onValueChange={(val: any) => setMode(val)} disabled={status === 'running'}>
                            <SelectTrigger size="sm" className="w-[130px] border-none bg-transparent shadow-none hover:bg-background/50">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="incremental">
                                    <span className="flex items-center gap-2 text-xs font-medium">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                                        {t('Manager.Auto.Modes.Incremental')}
                                    </span>
                                </SelectItem>
                                <SelectItem value="full">
                                    <span className="flex items-center gap-2 text-xs font-medium">
                                        <LayoutList className="w-3.5 h-3.5 text-blue-500" />
                                        {t('Manager.Auto.Modes.Full')}
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="w-px h-4 bg-border/50 mx-1" />

                        <Button
                            onClick={handleStart}
                            disabled={status === 'running'}
                            size="sm"
                            className={cn(
                                "rounded-lg px-4 font-semibold transition-all shadow-lg",
                                status === 'running' ? "bg-muted" : "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20"
                            )}
                        >
                            {status === 'running' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('Manager.Auto.Status.Running')}</>
                            ) : (
                                <><Play className="w-4 h-4 mr-2 fill-current" /> {t('Manager.Auto.Actions.StartAuto')}</>
                            )}
                        </Button>
                    </div>
                </div>

                {/* 统计看板 */}
                <div className="grid grid-cols-4 gap-4 shrink-0">
                    <StatsCard
                        label={t('Manager.Auto.Stats.TotalInstalled')}
                        value={summary.total || tasks.length}
                        icon={<Package className="w-4 h-4 text-blue-500" />}
                    />
                    <StatsCard
                        label={t('Manager.Auto.Stats.AppliedCount')}
                        value={summary.applied}
                        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        subLabel={t('Manager.Auto.Stats.Plugins') + '/' + t('Manager.Auto.Stats.Themes')}
                    />
                    <StatsCard
                        label={t('Manager.Auto.Stats.CurrentSuccess')}
                        value={summary.success}
                        icon={<Zap className="w-4 h-4 text-amber-500" />}
                        color="text-emerald-500"
                    />
                    <StatsCard
                        label={t('Manager.Auto.Stats.CurrentSkipped')}
                        value={summary.skipped + summary.error}
                        icon={<AlertCircle className="w-4 h-4 text-muted-foreground" />}
                    />
                </div>

                {/* 进度与任务列表 */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0 bg-muted/5 rounded-2xl border border-border/40 p-1">
                    {status === 'running' && progress.total > 0 && (
                        <div className="px-4 pt-4 pb-2 animate-in slide-in-from-top duration-300">
                            <div className="flex justify-between text-[11px] mb-2 font-medium">
                                <span className="text-blue-500 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {t('Manager.Auto.Status.Running')}...
                                </span>
                                <span>{progress.current} / {progress.total}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {tasks.length > 0 && (
                        <div className="flex items-center gap-1.5 px-4 pt-2 pb-1 overflow-x-auto custom-scrollbar shrink-0">
                            {[
                                { id: 'all', label: t('Manager.Common.Filters.All'), count: tasks.length },
                                { id: 'success', label: t('Manager.Common.Status.Labels.success'), count: tasks.filter(t => t.status === 'success').length },
                                { id: 'error', label: t('Manager.Common.Status.Labels.error'), count: tasks.filter(t => t.status === 'error').length },
                                { id: 'skipped', label: t('Manager.Common.Status.Labels.skipped'), count: tasks.filter(t => t.status === 'skipped').length },
                                { id: 'found', label: t('Manager.Common.Status.Labels.found'), count: tasks.filter(t => t.status === 'found').length }
                            ].map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => setFilterStatus(filter.id as any)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                                        filterStatus === filter.id 
                                            ? "bg-amber-500 text-white shadow-sm" 
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    {filter.label} <span className="opacity-70 ml-1">({filter.count})</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                        {tasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30 py-12">
                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <LayoutList className="w-8 h-8" />
                                </div>
                                <p className="text-sm font-medium">{t('Manager.Auto.Status.NoLogs')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
                                {[...tasks]
                                .filter(t => filterStatus === 'all' || t.status === filterStatus)
                                .sort((a, b) => {
                                    const statusOrder = { processing: 6, error: 5, found: 4, success: 3, pending: 2, skipped: 1 };
                                    return statusOrder[b.status] - statusOrder[a.status];
                                }).map(task => <TaskCard key={task.id} task={task} i18n={i18n} />)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 右侧设置与资源管理侧边栏 */}
            <div className="w-80 border-l border-border flex flex-col h-full bg-muted/10 shrink-0">
                <div className="p-6 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
                    {/* 受信任仓库管理 */}
                    <section>
                        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-amber-500" />
                            {t('Manager.Auto.Repos.Title')}
                        </h3>
                        <div className="flex gap-2 mb-4">
                            <Input
                                placeholder={t('Manager.Auto.Repos.AddPlaceholder')}
                                className="h-8 text-xs bg-background shadow-none border-border/60 focus:ring-1 focus:ring-amber-500/20"
                                value={newRepo}
                                onChange={(e) => setNewRepo(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !isAdding && handleAddRepo()}
                                disabled={isAdding}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 hover:bg-amber-500/10 hover:text-amber-600 border border-border/40" onClick={handleAddRepo} disabled={isAdding}>
                                {isAdding ? <Loader2 className="w-4 h-4 animate-spin opacity-50" /> : <Plus className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                            {trustedRepos.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic px-2 py-4 text-center border border-dashed rounded-xl bg-background/50">
                                    {t('Manager.Auto.Repos.Empty')}
                                </p>
                            ) : (
                                trustedRepos.map((repo) => (
                                    <div key={repo} className="flex items-center justify-between group p-2 rounded-lg bg-background border border-border/40 hover:border-amber-500/30 hover:shadow-sm transition-all">
                                        <span className="text-xs font-mono text-muted-foreground truncate flex-1 pr-2" title={repo}>
                                            {repo}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveRepo(repo)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* 自动化配置快速开关 */}
                    <section>
                        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5 text-blue-500" />
                            {t('Manager.Auto.QuickSettings.Title')}
                        </h3>
                        <div className="space-y-2.5">
                            <ConfigToggle
                                icon={<Zap className="w-4 h-4" />}
                                label={t('Manager.Auto.QuickSettings.AutoApply')}
                                active={autoApply}
                                onToggle={() => toggleConfig('autoApply')}
                            />
                            <ConfigToggle
                                icon={<Monitor className="w-4 h-4" />}
                                label={t('Manager.Auto.QuickSettings.SilentMode')}
                                active={autoSilentMode}
                                onToggle={() => toggleConfig('autoSilentMode')}
                            />
                        </div>
                    </section>

                    {/* 缓存管理 */}
                    <section>
                        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 text-purple-500" />
                            缓存管理
                        </h3>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full text-xs h-8 justify-start px-3 bg-background/50 hover:bg-muted" 
                            onClick={() => {
                                i18n.autoManager.invalidateCache();
                                i18n.notice.success('注册表与统计数据缓存已清理');
                            }}
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-2 opacity-70" />
                            清除注册表缓存
                        </Button>
                    </section>

                    {/* 信息与页脚 */}
                    <section className="mt-auto pt-8 border-t border-border/60">
                        <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
                            <h4 className="text-[11px] font-bold text-amber-700 dark:text-amber-500 mb-2 flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" />
                                {t('Manager.Auto.Tips.Title')}
                            </h4>
                            <p className="text-[10px] leading-relaxed text-muted-foreground opacity-80" dangerouslySetInnerHTML={{ __html: t('Manager.Auto.Tips.Desc') }} />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

// 统计卡片组件
const StatsCard = ({ label, value, icon, color = "text-foreground", subLabel }: { label: string, value: number, icon: React.ReactNode, color?: string, subLabel?: string }) => (
    <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:border-amber-500/20 group relative overflow-hidden">
        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            {icon}
        </div>
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight mb-1">{label}</div>
        <div className={cn("text-2xl font-bold tracking-tighter", color)}>{value}</div>
        {subLabel && <div className="text-[10px] text-muted-foreground mt-1 opacity-60 font-medium">{subLabel}</div>}
    </div>
);

// 配置开关项组件
const ConfigToggle = ({ icon, label, active, onToggle }: { icon: React.ReactNode, label: string, active: boolean, onToggle: () => void }) => (
    <div
        className={cn(
            "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group shadow-sm",
            active ? "bg-background border-amber-500/20 ring-1 ring-amber-500/10" : "bg-background/40 border-border/40 hover:border-border"
        )}
        onClick={onToggle}
    >
        <div className="flex items-center gap-3">
            <div className={cn("shrink-0 transition-colors p-1 rounded-lg", active ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground")}>
                {icon}
            </div>
            <span className={cn("text-xs font-semibold transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
                {label}
            </span>
        </div>
        <div className={cn(
            "w-8 h-4.5 rounded-full relative transition-colors p-0.5",
            active ? "bg-amber-500" : "bg-muted-foreground/30"
        )}>
            <div className={cn(
                "w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm",
                active ? "translate-x-3.5" : "translate-x-0"
            )} />
        </div>
    </div>
);

// 任务卡片组件
const TaskCard = ({ task, i18n }: { task: AutoTaskItem; i18n: I18N }) => {
    const { t } = useTranslation();
    const getStatusTheme = (status: AutoTaskStatus) => {
        switch (status) {
            case 'pending': return { bg: 'bg-muted/10', text: 'text-muted-foreground', border: 'border-border/30', icon: <RefreshCw className="w-3 h-3 opacity-40" /> };
            case 'processing': return { bg: 'bg-blue-500/5', text: 'text-blue-600 font-bold', border: 'border-blue-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> };
            case 'success': return { bg: 'bg-emerald-500/5', text: 'text-emerald-600 font-bold', border: 'border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" /> };
            case 'found': return { bg: 'bg-amber-500/5', text: 'text-amber-600 font-bold', border: 'border-amber-500/20', icon: <Zap className="w-3 h-3" /> };
            case 'skipped': return { bg: 'bg-amber-500/5', text: 'text-muted-foreground font-bold', border: 'border-border/20', icon: <AlertCircle className="w-3 h-3" /> };
            case 'error': return { bg: 'bg-destructive/5', text: 'text-destructive font-bold', border: 'border-destructive/20', icon: <AlertCircle className="w-3 h-3" /> };
            default: return { bg: 'bg-muted/10', text: 'text-muted-foreground', border: 'border-border/30', icon: <RefreshCw className="w-3 h-3 opacity-40" /> };
        }
    };

    const theme = getStatusTheme(task.status);

    return (
        <div className={cn(
            "rounded-xl border p-3 flex flex-col gap-2.5 transition-all duration-300 group",
            theme.bg, theme.border,
            task.status === 'processing' && "ring-2 ring-blue-500/20 shadow-md scale-[1.02]"
        )}>
            <div className="flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("p-1.5 rounded-lg shrink-0 bg-background border border-border/30 shadow-xs", theme.text)}>
                        {task.type === 'plugin' ? <Package className="w-4 h-4" /> : <Palette className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-[13px] truncate" title={task.name || task.id}>
                            {task.name || task.id}
                        </div>
                        <div className="text-[10px] opacity-50 font-mono truncate">{task.id}</div>
                    </div>
                </div>
                {task.status === 'found' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-lg hover:bg-emerald-500 hover:text-white"
                        onClick={async () => {
                            if (task.type === 'plugin') {
                                await i18n.injectorManager.applyToPlugin(task.id);
                            } else {
                                await i18n.injectorManager.applyToTheme(task.id);
                            }
                            // 更新本地 Store 状态
                            useAutoStore.getState().updateTaskStatus(task.id, 'success');
                        }}
                    >
                        <Play className="w-3.5 h-3.5 fill-current" />
                    </Button>
                )}
                {task.status === 'error' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-lg hover:bg-amber-500 hover:text-white"
                        title={t('Manager.Common.Actions.Retry', '重试')}
                        onClick={async () => {
                            if (!i18n.autoManager.retryTask) return;
                            await i18n.autoManager.retryTask(task.id, task.type);
                        }}
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <div className={cn("flex items-center gap-1.5 text-[11px] uppercase tracking-wider", theme.text)}>
                    {theme.icon}
                    {/* @ts-ignore */}
                    {t('Manager.Common.Status.Labels.' + task.status)}
                </div>
                {task.message ? (
                    <div className="text-[10px] text-destructive/70 font-medium px-1.5 py-0.5 bg-destructive/5 rounded border border-destructive/10 max-w-[150px] truncate" title={task.message}>
                        {task.message}
                    </div>
                ) : task.source ? (
                    <div className="text-[9px] font-mono text-muted-foreground/60 font-semibold px-1.5 py-0.5 bg-muted/30 rounded border border-border/20 truncate max-w-[140px]" title={task.source}>
                        {task.source.split('/')[1] || task.source}
                    </div>
                ) : (
                    <div className="text-[10px] font-bold text-muted-foreground/40 italic">
                        {/* @ts-ignore */}
                        {t('Manager.Common.Status.Labels.' + task.type)}
                    </div>
                )}
            </div>
        </div>
    );
};
