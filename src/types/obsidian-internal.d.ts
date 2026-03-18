import 'obsidian';

declare module 'obsidian' {
    interface App {
        plugins: {
            manifests: Record<string, PluginManifest>;
            enabledPlugins: Set<string>;
            disablePlugin(id: string): Promise<void>;
            enablePlugin(id: string): Promise<void>;
        };
    }

    interface DataAdapter {
        getBasePath?(): string;
    }
}
