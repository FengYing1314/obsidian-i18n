import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
    Input, Button, Checkbox, Badge, ScrollArea,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '~/shadcn';
import { cn } from '~/shadcn/lib/utils';
import { Search, Download, Upload, Trash2, MoreVertical, FileJson, Globe, HardDrive, Filter, Info, Puzzle, Palette, AlertCircle } from 'lucide-react';
import I18N from 'src/main';
import { TranslationSource } from 'src/types';
import { Notice } from 'obsidian';
import * as fs from 'fs-extra';
import * as zlib from 'zlib';
import * as path from 'path';
import { useGlobalStoreInstance, i18nOpen } from '~/utils';
import { loadTranslationFile } from '../../../manager/io-manager';
import { EDITOR_VIEW_TYPE } from '../../../views';

interface TranslationManagerPanelProps {
    i18n: I18N;
}

export const TranslationManagerPanel: React.FC<TranslationManagerPanelProps> = ({ i18n }) => {
    const { t } = useTranslation();
    const sourceManager = i18n.sourceManager;

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [originFilter, setOriginFilter] = useState<'all' | 'local' | 'cloud'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'plugin' | 'theme'>('all');

    // 监听全局更新 Tick 以刷新列表
    const sourceTick = useGlobalStoreInstance((state) => state.sourceUpdateTick);

    // 获取所有翻译源并应用过滤
    const allSources = useMemo(() => {
        let sources = sourceManager.getAllSources();

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            sources = sources.filter(s =>
                s.title.toLowerCase().includes(query) ||
                s.plugin.toLowerCase().includes(query) ||
                s.id.toLowerCase().includes(query)
            );
        }

        if (originFilter !== 'all') {
            sources = sources.filter(s => s.origin === originFilter);
        }

        if (typeFilter !== 'all') {
            sources = sources.filter(s => s.type === typeFilter);
        }

        sources = sources.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        // @ts-ignore - internal API
        const basePath = path.normalize(i18n.app.vault.adapter.getBasePath());

        return sources.map(s => {
            let isInstalled = false;
            if (s.type === 'plugin') {
                isInstalled = !!i18n.app.plugins.manifests[s.plugin];
            } else {
                isInstalled = fs.existsSync(path.join(basePath, '.obsidian', 'themes', s.plugin));
            }
            return { ...s, isInstalled };
        });
    }, [i18n, searchQuery, originFilter, typeFilter, sourceTick, i18n.app.plugins.manifests]);

    // 处理全选/反选
    const toggleSelectAll = () => {
        if (selectedIds.size === allSources.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(allSources.map(s => s.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleSelectUninstalled = () => {
        const next = new Set(selectedIds);
        let changed = false;
        allSources.forEach(s => {
            if (!s.isInstalled && !next.has(s.id)) {
                next.add(s.id);
                changed = true;
            }
        });
        if (changed) setSelectedIds(next);
    };

    // 格式化日期
    const formatDate = (ts?: number) => {
        if (!ts) return '-';
        return new Date(ts).toLocaleString();
    };

    // 批量导出逻辑
    const handleBatchExport = async () => {
        if (selectedIds.size === 0) return;

        try {
            const exportData: Record<string, any> = {};
            for (const id of selectedIds) {
                const source = sourceManager.getSource(id);
                if (source) {
                    const content = sourceManager.readSourceFile(id);
                    exportData[id] = {
                        meta: source,
                        content: content
                    };
                }
            }

            const jsonString = JSON.stringify(exportData);
            const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
            const blob = new Blob([new Uint8Array(compressed)], { type: 'application/gzip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `i18n-translations-export-${Date.now()}.i18n.gz`;
            a.click();
            URL.revokeObjectURL(url);

            new Notice(t('Manager.Sources.Actions.ExportSuccess'));
        } catch (error) {
            console.error('Export failed:', error);
            new Notice(t('Manager.Common.Errors.Error'));
        }
    };

    // 导入逻辑
    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.i18n.gz,.gz,.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const buffer = event.target?.result as ArrayBuffer;
                        let content: string;

                        // 根据后缀或内容尝试解压
                        if (file.name.endsWith('.gz') || file.name.endsWith('.i18n.gz')) {
                            const decompressed = zlib.gunzipSync(Buffer.from(buffer));
                            content = decompressed.toString('utf-8');
                        } else {
                            // 兼容旧的 JSON 格式
                            content = new TextDecoder().decode(buffer);
                        }

                        const data = JSON.parse(content);
                        let addedCount = 0;
                        let updatedCount = 0;
                        let skippedCount = 0;

                        if (data && typeof data === 'object') {
                            for (const key in data) {
                                const item = data[key];
                                if (item.meta && item.content) {
                                    const existing = sourceManager.getSource(item.meta.id);
                                    if (existing) {
                                        if (existing.checksum === item.meta.checksum) {
                                            skippedCount++;
                                            continue;
                                        } else {
                                            updatedCount++;
                                        }
                                    } else {
                                        addedCount++;
                                    }

                                    sourceManager.saveSource(item.meta);
                                    sourceManager.saveSourceFile(item.meta.id, item.content);
                                }
                            }
                        }

                        if (addedCount > 0 || updatedCount > 0) {
                            let msg = '';
                            if (addedCount > 0) msg += `新增 ${addedCount} `;
                            if (updatedCount > 0) msg += `更新 ${updatedCount} `;
                            if (skippedCount > 0) msg += `(跳过 ${skippedCount} 项重复)`;
                            new Notice(msg.trim() || t('Manager.Sources.Actions.ImportSuccess', { count: addedCount + updatedCount }));
                            // 刷新列表
                            useGlobalStoreInstance.getState().triggerSourceUpdate();
                        } else if (skippedCount > 0) {
                            new Notice(`全部 ${skippedCount} 项已存在且内容一致，无需导入`);
                        } else {
                            new Notice(t('Manager.Common.Errors.ErrorDesc'));
                        }
                    } catch (err) {
                        console.error('Import processing failed:', err);
                        new Notice(t('Manager.Common.Errors.Error'));
                    }
                };
                reader.readAsArrayBuffer(file);
            } catch (error) {
                new Notice(t('Manager.Common.Errors.Error'));
            }
        };
        input.click();
    };

    // 批量删除
    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;

        const confirmed = window.confirm(t('Manager.Sources.Actions.DeleteConfirm', { count: selectedIds.size }));
        if (!confirmed) return;

        try {
            for (const id of selectedIds) {
                sourceManager.removeSource(id);
            }
            setSelectedIds(new Set());
            new Notice(t('Common.Notices.DeleteSuccess'));
            // 刷新列表
            useGlobalStoreInstance.getState().triggerSourceUpdate();
        } catch (error) {
            new Notice(t('Manager.Common.Errors.Error'));
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
            {/* 顶栏控制区 */}
            <div className="flex flex-col gap-4 py-2 px-4 border-b shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                        <Input
                            className="pl-8 h-9 rounded-none border-muted-foreground/20 focus:ring-1 text-sm"
                            placeholder={t('Manager.Sources.Filters.SearchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-none border-muted-foreground/20">
                                    <Filter className="w-3.5 h-3.5" />
                                    {originFilter === 'all' ? t('Manager.Common.Filters.All') :
                                        originFilter === 'local' ? t('Manager.Sources.Filters.OriginLocal') :
                                            t('Manager.Sources.Filters.OriginCloud')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 rounded-none">
                                <DropdownMenuItem onClick={() => setOriginFilter('all')}>{t('Manager.Common.Filters.All')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setOriginFilter('local')}>{t('Manager.Sources.Filters.OriginLocal')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setOriginFilter('cloud')}>{t('Manager.Sources.Filters.OriginCloud')}</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-none border-muted-foreground/20">
                                    <Filter className="w-3.5 h-3.5" />
                                    {typeFilter === 'all' ? t('Manager.Common.Filters.All') :
                                        typeFilter === 'plugin' ? t('Common.Labels.Plugins') :
                                            t('Common.Labels.Themes')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 rounded-none">
                                <DropdownMenuItem onClick={() => setTypeFilter('all')}>{t('Manager.Common.Filters.All')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTypeFilter('plugin')}>{t('Common.Labels.Plugins')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTypeFilter('theme')}>{t('Common.Labels.Themes')}</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-2 border-l pl-2 border-border/50 ml-auto">
                        <Button variant="outline" size="sm" onClick={handleSelectUninstalled} className="gap-1.5 h-9 rounded-none border-muted-foreground/20" title={t('Manager.Sources.Actions.SelectUninstalled')}>
                            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                            <span className="hidden lg:inline">{t('Manager.Sources.Actions.SelectUninstalled')}</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5 h-9 rounded-none border-muted-foreground/20">
                            <Upload className="w-3.5 h-3.5" />
                            {t('Manager.Sources.Actions.Import')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBatchExport}
                            disabled={selectedIds.size === 0}
                            className="gap-1.5 h-9 rounded-none border-muted-foreground/20"
                        >
                            <Download className="w-3.5 h-3.5" />
                            {t('Manager.Sources.Actions.Export')}
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleBatchDelete}
                            disabled={selectedIds.size === 0}
                            className="gap-1.5 h-9 rounded-none"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('Manager.Sources.Actions.BatchDelete')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* 内容列表区 */}
            <ScrollArea className="flex-1 min-h-0 bg-background">
                <div className="px-4 py-2 h-full">
                    {allSources.length > 0 && (
                        <div className="flex items-center gap-4 px-2 pb-2 mb-1 border-b border-border/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <div className="flex items-center justify-center w-8 shrink-0">
                                <Checkbox
                                    className="rounded-none scale-90"
                                    checked={allSources.length > 0 && selectedIds.size === allSources.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </div>
                            <span className="pl-2">{t('Manager.Sources.Table.Name')}</span>
                            <div className="flex-1"></div>
                            <span className="hidden md:block min-w-[80px] text-right mr-10">{t('Manager.Sources.Table.Mtime')}</span>
                        </div>
                    )}

                    <div className="flex flex-col pb-6">
                        {allSources.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-muted-foreground py-24 border border-dashed border-border/50 bg-muted/5 my-4 rounded-none">
                                <FileJson className="w-10 h-10 opacity-30 text-primary mb-4" />
                                <p className="text-sm font-bold text-foreground/70 mb-1">{t('Manager.Plugins.Status.NoTrans')}</p>
                                <p className="text-xs opacity-60">{t('Manager.Common.Placeholders.SearchPlaceholder')}</p>
                            </div>
                        ) : (
                            allSources.map(source => (
                                <div key={source.id} className={cn(
                                    "group relative flex items-center gap-4 py-2.5 px-2 border-b transition-colors duration-200",
                                    selectedIds.has(source.id)
                                        ? "bg-primary/[0.05] border-primary/20"
                                        : "bg-transparent border-border/40 hover:bg-muted/40"
                                )}>
                                    <div className="flex items-center justify-center w-8 shrink-0">
                                        <Checkbox
                                            className={cn("rounded-none transition-opacity", selectedIds.has(source.id) ? "opacity-100" : "opacity-30 group-hover:opacity-100")}
                                            checked={selectedIds.has(source.id)}
                                            onCheckedChange={() => toggleSelect(source.id)}
                                        />
                                    </div>

                                    <div className={cn("flex items-center justify-center w-9 h-9 shrink-0 border border-border/20 rounded-none",
                                        source.origin === 'cloud'
                                            ? "bg-blue-500/10 text-blue-500"
                                            : "bg-emerald-500/10 text-emerald-500"
                                    )}>
                                        {source.origin === 'cloud' ? <Globe className="w-4 h-4 drop-shadow-sm" /> : <HardDrive className="w-4 h-4 drop-shadow-sm" />}
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[13px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                {source.title}
                                            </span>
                                            {/* 未安装提示 */}
                                            {!source.isInstalled && (
                                                <span className="text-[10px] text-destructive flex items-center gap-1 font-medium bg-destructive/10 px-1.5 py-0.5 rounded-sm shrink-0">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {source.type === 'theme' ? t('Manager.Sources.Status.ThemeNotInstalled') : t('Manager.Sources.Status.NotInstalled')}
                                                </span>
                                            )}
                                            {source.type === 'theme' ? (
                                                <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/15 border border-orange-500/20 text-[9px] px-1.5 py-0 h-[18px] font-medium shrink-0 rounded-none">
                                                    {t('Common.Labels.Themes')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/15 border border-purple-500/20 text-[9px] px-1.5 py-0 h-[18px] font-medium shrink-0 rounded-none">
                                                    {t('Common.Labels.Plugins')}
                                                </Badge>
                                            )}
                                            <Badge variant="outline" className="hidden sm:inline-flex text-[9px] px-1.5 py-0 h-[18px] font-medium text-muted-foreground/60 border-border/50 shrink-0 rounded-none">
                                                {source.origin === 'cloud' ? t('Manager.Sources.Filters.OriginCloud') : t('Manager.Sources.Filters.OriginLocal')}
                                            </Badge>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground/60 font-mono truncate max-w-[400px]">
                                            {source.plugin}
                                        </span>
                                    </div>

                                    <div className="hidden md:flex flex-col items-end justify-center px-4 shrink-0 min-w-[90px]">
                                        <span className="text-[11px] font-medium text-muted-foreground/80">
                                            {formatDate(source.updatedAt).split(' ')[0]}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                                            {formatDate(source.updatedAt).split(' ')[1]}
                                        </span>
                                    </div>

                                    <div className="shrink-0 flex items-center justify-end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 rounded-none">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[160px] rounded-none p-1 shadow-md border-border/40">
                                                <DropdownMenuItem className="text-xs rounded-none cursor-pointer" onClick={() => {
                                                    const filePath = sourceManager.getSourceFilePath(source.id);
                                                    const pluginTranslationV1 = loadTranslationFile(filePath);
                                                    useGlobalStoreInstance.getState().setEditorPluginTranslation(pluginTranslationV1);
                                                    useGlobalStoreInstance.getState().setEditorPluginTranslationPath(filePath);
                                                    i18n.view.activateView(EDITOR_VIEW_TYPE);
                                                }}>
                                                    {t('Manager.Common.Actions.Edit')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-xs rounded-none cursor-pointer" onClick={() => {
                                                    const filePath = sourceManager.getSourceFilePath(source.id);
                                                    i18nOpen(i18n, path.dirname(filePath));
                                                }}>
                                                    {t('Manager.Common.Actions.OpenFolder')}
                                                </DropdownMenuItem>
                                                <div className="h-px bg-border/40 my-1 mx-1" />
                                                <DropdownMenuItem className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10 rounded-none cursor-pointer" onClick={() => {
                                                    sourceManager.removeSource(source.id);
                                                    new Notice(t('Common.Notices.DeleteSuccess'));
                                                    useGlobalStoreInstance.getState().triggerSourceUpdate();
                                                }}>
                                                    {t('Manager.Common.Actions.Delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </ScrollArea>

            {/* 状态栏 */}
            <div className="shrink-0 px-4 py-2 border-t bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        {t('Manager.Sources.Stats.Total')}: {allSources.length}
                    </span>
                    {selectedIds.size > 0 && (
                        <span className="text-primary font-medium">
                            {t('Manager.Sources.Stats.Selected')}: {selectedIds.size}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        {t('Manager.Sources.Filters.OriginLocal')}: {allSources.filter(s => s.origin === 'local').length}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        {t('Manager.Sources.Filters.OriginCloud')}: {allSources.filter(s => s.origin === 'cloud').length}
                    </span>
                </div>
            </div>
        </div>
    );
};
