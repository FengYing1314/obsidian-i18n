import { App } from 'obsidian';
import { AutoHistoryItem, AutoTaskItem } from '../views/manager/auto-store';

export class HistoryManager {
    private app: App;
    private historyPath: string;

    constructor(app: App, configPath: string) {
        this.app = app;
        this.historyPath = `${configPath}/auto-history.json`;
    }

    async loadHistory(): Promise<AutoHistoryItem[]> {
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.historyPath)) {
                const data = await adapter.read(this.historyPath);
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Failed to load auto history:', e);
        }
        return [];
    }

    async saveHistory(history: AutoHistoryItem[]): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const dir = this.historyPath.split('/').slice(0, -1).join('/');
            if (!(await adapter.exists(dir))) {
                await adapter.mkdir(dir);
            }
            const data = history.slice(0, 50);
            await adapter.write(this.historyPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save auto history:', e);
        }
    }

    async addRecord(trigger: AutoHistoryItem['trigger'], tasks: AutoTaskItem[]): Promise<AutoHistoryItem> {
        const history = await this.loadHistory();
        
        const success = tasks.filter(t => t.status === 'success').length;
        const error = tasks.filter(t => t.status === 'error').length;
        const skipped = tasks.filter(t => t.status === 'skipped').length;
        const upToDate = tasks.filter(t => t.status === 'up_to_date').length;
        const discovered = tasks.filter(t => t.status === 'discovered_new' || t.status === 'discovered_update').length;

        const newItem: AutoHistoryItem = {
            id: Date.now().toString(),
            time: Date.now(),
            trigger,
            summary: {
                total: tasks.length,
                success,
                error,
                skipped,
                discovered,
                upToDate
            },
            details: JSON.stringify(tasks.filter(t => t.status !== 'pending' && t.status !== 'skipped'))
        };

        history.unshift(newItem);
        await this.saveHistory(history);
        return newItem;
    }

    async clear(): Promise<void> {
        await this.saveHistory([]);
    }
}
