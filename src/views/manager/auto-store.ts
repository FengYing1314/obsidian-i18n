import { create } from 'zustand';

export type AutoLevel = 'info' | 'success' | 'warning' | 'error';

export type AutoTaskStatus = 'pending' | 'processing' | 'success' | 'found' | 'skipped' | 'error';
export type FilterStatus = 'all' | 'success' | 'error' | 'skipped' | 'found';


export interface AutoTaskItem {
    id: string;
    type: 'plugin' | 'theme';
    name?: string;
    status: AutoTaskStatus;
    message?: string;
    source?: string;
    translationVersion?: string;
}

export interface AutoState {
    status: AutoTaskStatus | 'idle' | 'running' | 'success' | 'error';
    progress: { current: number; total: number };
    summary: {
        success: number;
        skipped: number;
        error: number;
        total: number;
        applied: number; // 总共已应用过的翻译数量 (长期统计)
    };
    tasks: AutoTaskItem[];
    trustedRepos: string[]; // 受信任仓库列表缓存
    autoApply: boolean;
    autoSilentMode: boolean;
    filterStatus: FilterStatus;
    
    
    setStatus: (status: AutoState['status']) => void;
    setFilterStatus: (status: FilterStatus) => void;
    setProgress: (current: number, total: number) => void;
    initTasks: (tasks: { id: string, type: 'plugin' | 'theme', name: string }[]) => void;
    updateTaskStatus: (id: string, status: AutoTaskStatus, message?: string, source?: string, version?: string) => void;
    addTasks: (tasks: AutoTaskItem[]) => void;
    setSummary: (summary: Partial<AutoState['summary']>) => void;
    
    // 配置同步 Actions
    setTrustedRepos: (repos: string[]) => void;
    addTrustedRepo: (repo: string) => void;
    removeTrustedRepo: (repo: string) => void;
    setConfigs: (configs: { autoApply?: boolean, autoSilentMode?: boolean }) => void;
    
    hydrate: (settings: any, stats?: { appliedCount: number }) => void;
    clearAll: () => void;
}

export const useAutoStore = create<AutoState>()((set, get) => ({
    status: 'idle',
    progress: { current: 0, total: 0 },
    summary: {
        success: 0,
        skipped: 0,
        error: 0,
        total: 0,
        applied: 0
    },
    tasks: [],
    trustedRepos: [],
    autoApply: true,
    autoSilentMode: false,
    filterStatus: 'all',

    setStatus: (status) => set({ status }),
    setFilterStatus: (status) => set({ filterStatus: status }),
    
    setProgress: (current, total) => set({
        progress: { current, total }
    }),

    setSummary: (summary) => set((state) => ({ 
        summary: { ...state.summary, ...summary } 
    })),
    
    initTasks: (tasks) => set({ 
        tasks: tasks.map(t => ({ ...t, status: 'pending' })),
        summary: { success: 0, skipped: 0, error: 0, total: tasks.length, applied: get().summary.applied }
    }),
    
    updateTaskStatus: (id, status, message, source, version) => set((state) => {
        const newTasks = state.tasks.map(t => t.id === id ? { 
            ...t, 
            status, 
            message: message || t.message,
            source: source || t.source,
            translationVersion: version || t.translationVersion
        } : t);
        
        // 实时更新统计数据
        const success = newTasks.filter(t => t.status === 'success').length;
        const skipped = newTasks.filter(t => t.status === 'skipped').length;
        const found = newTasks.filter(t => t.status === 'found').length;
        const error = newTasks.filter(t => t.status === 'error').length;
        
        return { 
            tasks: newTasks,
            summary: { ...state.summary, success: success + found, skipped, error }
        };
    }),

    addTasks: (newTasks) => set((state) => ({
        tasks: [...state.tasks, ...newTasks],
        summary: { ...state.summary, total: state.summary.total + newTasks.length }
    })),

    setTrustedRepos: (repos) => set({ trustedRepos: repos }),
    addTrustedRepo: (repo) => set((state) => ({ 
        trustedRepos: state.trustedRepos.includes(repo) ? state.trustedRepos : [...state.trustedRepos, repo] 
    })),
    removeTrustedRepo: (repo) => set((state) => ({ 
        trustedRepos: state.trustedRepos.filter(r => r !== repo) 
    })),
    setConfigs: (configs) => set((state) => ({ ...state, ...configs })),

    hydrate: (settings, stats) => set({
        trustedRepos: settings.autoTrustedRepos || [],
        autoApply: settings.autoApply !== undefined ? settings.autoApply : true,
        autoSilentMode: settings.autoSilentMode !== undefined ? settings.autoSilentMode : false,
        summary: {
            ...get().summary,
            applied: stats?.appliedCount || 0
        }
    }),

    clearAll: () => set({ 
        tasks: [], 
        progress: { current: 0, total: 0 },
        status: 'idle',
        summary: { ...get().summary, success: 0, skipped: 0, error: 0, total: 0 }
    })
}));
