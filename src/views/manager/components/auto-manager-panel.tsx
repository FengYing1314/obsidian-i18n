import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoStore, AutoTaskItem, AutoScoreBreakdown } from '../auto-store';
import {
    Loader2, CheckCircle2, AlertCircle, RefreshCw, Play, Package,
    Palette, Zap, LayoutList, Settings2, Globe, Plus, Trash2,
    Monitor, Info, Activity, Gauge, Terminal, Shield, ListFilter,
    Filter, RotateCcw
} from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Checkbox } from '~/shadcn';
import { cn } from '~/shadcn/lib/utils';
import I18N from 'src/main';

interface AutoManagerPanelProps {
    i18n: I18N;
}

export const AutoManagerPanel: React.FC<AutoManagerPanelProps> = ({ i18n }) => {
    const { t } = useTranslation();
    const {
        status, progress, tasks, summary, clearAll,
        trustedRepos, addTrustedRepo, removeTrustedRepo,
        autoDiscovery, autoApply, autoMatchStrategy, autoCheckInterval, autoScanMode,
        filterStatus, setFilterStatus, setConfigs
    } = useAutoStore();

    const [newRepo, setNewRepo] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleStart = async () => {
        if (status === 'running') return;
        await i18n.autoManager.runSmartAuto({
            isIncremental: autoScanMode === 'incremental'
        });
    };

    const handleAddRepo = async () => {
        if (!newRepo.includes('/') || isAdding) return;
        setIsAdding(true);
        const isValid = await i18n.autoManager.verifyRepo(newRepo);
        if (isValid) {
            addTrustedRepo(newRepo);
            i18n.settings.autoTrustedRepos = Array.from(new Set([...i18n.settings.autoTrustedRepos, newRepo]));
            await i18n.saveSettings();
            setNewRepo('');
        } else {
            i18n.notice.error(t('Manager.Common.Errors.InvalidRepo' as any));
        }
        setIsAdding(false);
    };

    const handleRemoveRepo = async (repo: string) => {
        removeTrustedRepo(repo);
        i18n.settings.autoTrustedRepos = i18n.settings.autoTrustedRepos.filter(r => r !== repo);
        await i18n.saveSettings();
    };

    const toggleConfig = async (key: 'autoDiscovery' | 'autoApply') => {
        const newVal = !((i18n.settings as any)[key]);
        (i18n.settings as any)[key] = newVal;
        await i18n.saveSettings();
        setConfigs({ [key]: newVal });
    };

    const coverage = tasks.length > 0 ? Math.round((summary.upToDate / tasks.length) * 100) : 0;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden text-foreground">
            {/* Top Bar - Standardized height matching other managers (py-2 + h-9) */}
            <div className="flex items-center justify-between py-2 px-4 border-b shrink-0 bg-background shadow-xs">
                <div className="flex items-center gap-5">
                    {/* Coverage - Consistent alignment */}
                    <div className="flex items-center gap-3 pr-5 border-r border-border/40 h-9">
                        <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-muted/10" />
                                <circle
                                    cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2.5" fill="transparent"
                                    strokeDasharray={81.6}
                                    strokeDashoffset={81.6 * (1 - coverage / 100)}
                                    className="text-emerald-500 transition-all duration-1000 ease-out"
                                    strokeLinecap="butt"
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tracking-tighter">{coverage}%</span>
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase leading-none tracking-tight">{t('Manager.Auto.Stats.Health' as any)}</span>
                            <span className="text-[12px] font-black leading-tight mt-0.5">{t('Manager.Auto.Stats.VaultStatus' as any)}</span>
                        </div>
                    </div>

                    {/* Stats Pills - Consistent with Plugin Manager h-9 height */}
                    <div className="flex items-center gap-2 h-9">
                        <CompactStat label={t('Manager.Common.Status.Labels.up_to_date' as any)} value={summary.upToDate} color="text-blue-500" bg="bg-blue-500/5" icon={<CheckCircle2 className="w-4 h-4" />} />
                        <CompactStat label={t('Manager.Common.Status.Labels.discovered' as any)} value={summary.success} color="text-amber-500" bg="bg-amber-500/5" icon={<RefreshCw className="w-4 h-4" />} />
                        <CompactStat label={t('Manager.Common.Status.Labels.error' as any)} value={summary.error} color="text-rose-500" bg="bg-rose-500/5" icon={<AlertCircle className="w-4 h-4" />} />
                    </div>
                </div>

                <div className="flex items-center gap-2 h-9">
                    <Button
                        size="sm" variant="ghost"
                        className="h-9 px-3 rounded-none font-bold text-[13px] text-muted-foreground/80 hover:bg-muted/50 border border-transparent hover:border-border/40"
                        onClick={clearAll} disabled={status === 'running'}
                    >
                        <RotateCcw className="w-4 h-4 mr-2 opacity-60" />
                        {t('Common.Actions.Clear' as any) || "清空结果"}
                    </Button>
                    <Button
                        size="sm"
                        className={cn(
                            "h-9 px-5 rounded-none font-black text-[13px] transition-all shadow-sm",
                            status === 'running' ? "bg-muted cursor-not-allowed border border-border/40" : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                        onClick={handleStart} disabled={status === 'running'}
                    >
                        {status === 'running' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
                        {t('Manager.Auto.Actions.StartAuto' as any)}
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Running Progress Bar */}
                    {status === 'running' && progress.total > 0 && (
                        <div className="bg-primary/5 px-4 py-1.5 border-b border-primary/20 flex items-center justify-between shrink-0">
                            <span className="text-[10px] font-bold text-primary tracking-widest uppercase flex items-center gap-2">
                                <Activity className="w-3 h-3 animate-pulse" />
                                {t('Manager.Auto.Status.Analyzing' as any)}
                            </span>
                            <div className="flex items-center gap-3 w-1/3">
                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground/60">{progress.current}/{progress.total}</span>
                            </div>
                        </div>
                    )}

                    {/* Main Content Area - List Mode */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar bg-background">
                        {tasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 py-24">
                                <Terminal className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-[12px] font-bold uppercase tracking-[0.2em]">{t('Manager.Auto.Status.NoLogs' as any)}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1 pb-10">
                                {[...tasks]
                                    .filter(t => filterStatus === 'all' ? t.status !== 'pending' : t.status === filterStatus)
                                    .sort((a, b) => {
                                        const order: any = { processing: 10, discovered_update: 9, discovered_new: 8, error: 7, success: 6, up_to_date: 5 };
                                        return (order[b.status] || 0) - (order[a.status] || 0);
                                    })
                                    .map(task => <TaskItem key={task.id} task={task} i18n={i18n} />)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar - Matching Industrial Style */}
                <div className="w-72 border-l border-border/80 flex flex-col h-full bg-muted/10 shrink-0">
                    <div className="p-5 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">

                        {/* Task Filtering - Moved from Header */}
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <Filter className="w-3 h-3" />
                                {t('Manager.Auto.Filters.Title' as any)}
                            </h3>
                            <div className="flex flex-col gap-1">
                                {['all', 'discovered_update', 'discovered_new', 'up_to_date', 'success', 'error'].map(id => (
                                    <button
                                        key={id} onClick={() => setFilterStatus(id as any)}
                                        className={cn(
                                            "px-3 py-2 text-[12px] font-bold transition-all text-left border rounded-none flex justify-between items-center",
                                            filterStatus === id ? "bg-background border-primary/40 text-primary shadow-sm" : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <span>{id === 'all' ? t('Manager.Common.Filters.All' as any) : t(`Manager.Common.Status.Labels.${id}` as any)}</span>
                                        <span className="opacity-40 font-mono text-[10px]">({tasks.filter(t => id === 'all' ? t.status !== 'pending' : t.status === id).length})</span>
                                    </button>
                                ))}
                            </div>

                            {/* One-click Review Button */}
                            {tasks.filter(t => t.status.startsWith('discovered')).length > 0 && (
                                <Button
                                    size="sm"
                                    className="w-full h-10 mt-2 rounded-none font-black text-[12px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/10 transition-all active:scale-95"
                                    onClick={async () => {
                                        const ids = tasks.filter(t => t.status.startsWith('discovered')).map(t => t.id);
                                        await i18n.autoManager.applyBatchDiscovered(ids);
                                    }}
                                >
                                    <Zap className="w-4 h-4 mr-2 fill-current" />
                                    {t('Manager.Auto.Actions.OneClickReview' as any)} ({tasks.filter(t => t.status.startsWith('discovered')).length})
                                </Button>
                            )}
                        </section>

                        {/* Scoping */}
                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <LayoutList className="w-3 h-3" />
                                {t('Manager.Auto.Scoping.Title' as any)}
                            </h3>
                            <div className="border border-border/40 p-0.5 bg-background shadow-xs flex gap-0.5">
                                <button
                                    className={cn(
                                        "flex-1 py-2 text-[10px] font-bold rounded-none transition-all",
                                        autoScanMode === 'incremental' ? "bg-muted text-foreground shadow-sm" : "hover:bg-muted/50 text-muted-foreground/70"
                                    )}
                                    onClick={async () => {
                                        i18n.settings.autoScanMode = 'incremental';
                                        await i18n.saveSettings();
                                        setConfigs({ autoScanMode: 'incremental' });
                                    }}
                                >
                                    {t('Manager.Auto.Modes.Incremental' as any)}
                                </button>
                                <button
                                    className={cn(
                                        "flex-1 py-2 text-[10px] font-bold rounded-none transition-all",
                                        autoScanMode === 'full' ? "bg-muted text-foreground shadow-sm" : "hover:bg-muted/50 text-muted-foreground/70"
                                    )}
                                    onClick={async () => {
                                        i18n.settings.autoScanMode = 'full';
                                        await i18n.saveSettings();
                                        setConfigs({ autoScanMode: 'full' });
                                    }}
                                >
                                    {t('Manager.Auto.Modes.Full' as any)}
                                </button>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <Gauge className="w-3 h-3" />
                                {t('Manager.Common.Status.Labels.MatchStrategy' as any)}
                            </h3>
                            <Select
                                value={autoMatchStrategy}
                                onValueChange={async (val: any) => {
                                    i18n.settings.autoMatchStrategy = val;
                                    await i18n.saveSettings();
                                    setConfigs({ autoMatchStrategy: val });
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs bg-background border-border/40 rounded-none px-3 shadow-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-none border-border/80 shadow-2xl">
                                    <SelectItem value="comprehensive" className="text-xs">{t('Manager.Common.Status.Labels.MatchStrategies.comprehensive' as any)}</SelectItem>
                                    <SelectItem value="version_first" className="text-xs">{t('Manager.Common.Status.Labels.MatchStrategies.version_first' as any)}</SelectItem>
                                    <SelectItem value="popularity" className="text-xs">{t('Manager.Common.Status.Labels.MatchStrategies.popularity' as any)}</SelectItem>
                                    <SelectItem value="latest_update" className="text-xs">{t('Manager.Common.Status.Labels.MatchStrategies.latest_update' as any)}</SelectItem>
                                </SelectContent>
                            </Select>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <Settings2 className="w-3 h-3" />
                                {t('Manager.Auto.QuickSettings.Title' as any)}
                            </h3>
                            <div className="space-y-1.5">
                                <ConfigToggle label={t('Manager.Auto.QuickSettings.DiscoveryNotice' as any)} active={autoDiscovery} onToggle={() => toggleConfig('autoDiscovery')} />
                                <ConfigToggle label={t('Manager.Auto.QuickSettings.AutoApply' as any)} active={autoApply} onToggle={() => toggleConfig('autoApply')} />
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <Activity className="w-3 h-3" />
                                {t('Manager.Auto.QuickSettings.CheckInterval' as any)}
                            </h3>
                            <div className="px-3 py-2 bg-background border border-border/40 shadow-xs">
                                <div className="flex items-center justify-between gap-2">
                                    <Input
                                        type="number" value={autoCheckInterval}
                                        className="h-7 text-[12px] font-mono bg-transparent border-none p-0 focus-visible:ring-0 w-16"
                                        onChange={async (e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            i18n.settings.autoCheckInterval = val;
                                            await i18n.saveSettings();
                                            setConfigs({ autoCheckInterval: val });
                                        }}
                                    />
                                    <span className="text-[9px] font-black text-muted-foreground/50">{t('Manager.Auto.QuickSettings.Hours' as any)}</span>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-3 border-t pt-6">
                            <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
                                <Globe className="w-3 h-3" />
                                {t('Manager.Auto.Repos.Title' as any)}
                            </h3>
                            <div className="flex gap-1 mb-3">
                                <Input
                                    placeholder="owner/repo"
                                    value={newRepo}
                                    onChange={e => setNewRepo(e.target.value)}
                                    className="h-8 text-xs font-mono bg-background border-border/40 rounded-none shadow-xs"
                                    disabled={isAdding}
                                />
                                <Button
                                    size="icon" variant="outline"
                                    className="h-8 w-8 shrink-0 rounded-none border-border/40 bg-background hover:bg-muted"
                                    onClick={handleAddRepo}
                                    disabled={isAdding}
                                >
                                    {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                </Button>
                            </div>
                            <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                                {trustedRepos.map(r => (
                                    <div key={r} className="flex items-center justify-between group p-2 bg-muted/20 border border-transparent hover:border-border/40 text-[10px] font-mono text-muted-foreground rounded-none">
                                        <span className="truncate">{r}</span>
                                        <button onClick={() => handleRemoveRepo(r)} className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CompactStat = ({ label, value, color, bg, icon }: { label: string, value: number, color: string, bg: string, icon: React.ReactNode }) => (
    <div className={cn("flex items-center gap-2 px-2.5 py-1 border border-border/20 rounded-none h-9 bg-muted/10 shadow-xs transition-colors hover:bg-muted/20", color)}>
        <div className={cn("p-1 rounded-none", bg)}>{icon}</div>
        <div className="flex items-center gap-1.5 flex-nowrap">
            <span className="text-[11.5px] font-black tabular-nums">{value}</span>
            <span className="text-[10px] font-bold text-muted-foreground opacity-60 whitespace-nowrap">{label}</span>
        </div>
    </div>
);

const ConfigToggle = ({ label, active, onToggle }: { label: string, active: boolean, onToggle: () => void }) => (
    <div
        className={cn(
            "flex items-center justify-between px-3 py-2 border transition-all cursor-pointer group",
            active ? "bg-background border-border shadow-xs" : "bg-transparent border-transparent opacity-60 hover:opacity-100"
        )}
        onClick={onToggle}
    >
        <span className="text-[12px] font-bold tracking-tight">{label}</span>
        <div className={cn("w-7 h-4 rounded-full relative transition-colors bg-muted/50")}>
            <div className={cn("absolute top-0.5 w-3 h-3 rounded-full transition-all shadow-sm", active ? "bg-primary left-3.5" : "bg-muted-foreground/40 left-0.5")} />
        </div>
    </div>
);

const TaskItem = ({ task, i18n }: { task: AutoTaskItem, i18n: I18N }) => {
    const { t } = useTranslation();
    const isDiscovered = task.status === 'discovered_new' || task.status === 'discovered_update';

    // Status mapping for Accent Bar
    let statusColor = "bg-muted-foreground/30";
    let statusTextColor = "text-muted-foreground";
    if (task.status === 'success') { statusColor = "bg-emerald-500"; statusTextColor = "text-emerald-600"; }
    else if (task.status === 'error') { statusColor = "bg-rose-500"; statusTextColor = "text-rose-600"; }
    else if (task.status === 'processing') { statusColor = "bg-primary"; statusTextColor = "text-primary"; }
    else if (isDiscovered) { statusColor = "bg-amber-500"; statusTextColor = "text-amber-600"; }
    else if (task.status === 'up_to_date') { statusColor = "bg-blue-500"; statusTextColor = "text-blue-600"; }

    return (
        <div className={cn(
            "group relative border rounded-none bg-card/75 text-card-foreground shadow-xs hover:shadow-md hover:bg-muted/10 transition-all duration-300 px-4 py-1.5 w-full border-border/50 flex items-center gap-4 overflow-hidden backdrop-blur-md h-[46px]",
            task.status === 'processing' && "bg-primary/[0.02]"
        )}>
            {/* Status Accent */}
            <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", statusColor, task.status === 'processing' && "animate-pulse")} />

            {/* Type Icon */}
            <div className="flex items-center justify-center shrink-0 w-8">
                <div className={cn(
                    "w-7 h-7 rounded-none flex items-center justify-center border border-border/40 bg-background shadow-xs",
                    task.type === 'theme' ? "text-indigo-500" : "text-amber-500"
                )}>
                    {task.type === 'theme' ? <Palette className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                </div>
            </div>

            {/* Name, Version & Repo - Uniform single-line layout */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <h4 className="text-[13.5px] font-bold truncate tracking-tight text-foreground/90 group-hover:text-primary transition-colors shrink-0 max-w-[40%]">
                    {task.name || task.id}
                </h4>

                {task.targetVersion && (
                    <span className="text-[10px] text-primary/80 font-bold bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded-none shrink-0">
                        v{task.targetVersion}
                    </span>
                )}

                {task.sourceRepo && (
                    <span className="text-[10px] text-muted-foreground/50 truncate font-medium flex items-center gap-1 opacity-60">
                        <Globe className="w-3 h-3" />
                        {task.sourceRepo.split('/').pop()}
                    </span>
                )}

                {/* Status Badge in line */}
                <div className={cn(
                    "ml-auto px-2.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-extrabold rounded-none bg-background border border-border shadow-xs flex items-center gap-1.5 shrink-0 justify-center min-w-[75px]",
                    statusTextColor
                )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shadow-sm", statusColor, task.status === 'processing' ? "animate-pulse" : "")}></span>
                    {t(`Manager.Common.Status.Labels.${task.status}` as any)}
                </div>
            </div>

            {/* Quality Score Gauge */}
            <div className="flex items-center justify-center shrink-0 w-20">
                {task.scoreBreakdown && (
                    <TooltipProvider>
                        <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 cursor-help py-1 px-2 border border-transparent hover:border-border/40 group/score transition-all">
                                    <span className="text-[11px] font-black text-amber-500 tabular-nums">{task.scoreBreakdown.total}</span>
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className={cn("w-1.5 h-1.5 rounded-none", i <= Math.round(task.scoreBreakdown!.total / 33) ? "bg-amber-500" : "bg-muted")} />
                                        ))}
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="p-0 bg-background border border-border shadow-2xl rounded-none z-[999]">
                                <div className="p-3 space-y-2.5 min-w-[160px]">
                                    <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mb-1">{t('Manager.Auto.Discovery.ScoreBreakdown.Title' as any)}</div>
                                    <ScoreDetail label={t('Manager.Auto.Discovery.ScoreBreakdown.Version' as any)} score={task.scoreBreakdown.version} max={50} icon={<Monitor className="w-3 h-3" />} />
                                    <ScoreDetail label={t('Manager.Auto.Discovery.ScoreBreakdown.Popularity' as any)} score={task.scoreBreakdown.popularity} max={30} icon={<Activity className="w-3 h-3" />} />
                                    <ScoreDetail label={t('Manager.Auto.Discovery.ScoreBreakdown.Freshness' as any)} score={task.scoreBreakdown.freshness} max={20} icon={<RefreshCw className="w-3 h-3" />} />
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            <div className="shrink-0 flex items-center justify-end w-32">
                {isDiscovered ? (
                    <Button
                        variant="outline" size="sm"
                        className="h-8 px-4 text-[11px] font-black bg-primary text-primary-foreground border-none rounded-none hover:bg-primary/90 transition-all active:scale-95"
                        onClick={() => i18n.autoManager.retryTask(task.id, task.type)}
                    >
                        {t('Manager.Auto.Discovery.ReviewAction' as any)}
                    </Button>
                ) : (
                    <div className="w-8 h-8 rounded-full border-2 border-border/10 flex items-center justify-center opacity-20">
                        <CheckCircle2 className="w-4 h-4" />
                    </div>
                )}
            </div>

            {/* Message Placeholder - Subtle and absolute positioned to avoid affecting height */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 overflow-hidden max-w-[200px]">
                <span className="text-[8px] text-muted-foreground/20 italic truncate block">
                    {task.message && task.message !== "-" ? task.message : ""}
                </span>
            </div>
        </div>
    );
};

const ScoreDetail = ({ label, score, max, icon }: { label: string, score: number, max: number, icon: React.ReactNode }) => {
    const safeScore = score || 0;
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground/50">{icon}</span>
                <span className="text-foreground/70 font-bold text-[11px]">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-10 h-1 bg-muted/40 rounded-none overflow-hidden">
                    <div
                        className="h-full bg-amber-500/40"
                        style={{ width: `${Math.min((safeScore / max) * 100, 100)}%` }}
                    />
                </div>
                <span className="font-mono text-[11px] font-black min-w-[20px] text-right">{safeScore}</span>
            </div>
        </div>
    );
};

// Mock set for the UI
const selectedIds_mock = new Set<string>();
