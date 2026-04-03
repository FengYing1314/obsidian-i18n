/**
 * LLM Translation Provider 统一接口定义
 * 
 * 所有翻译服务商（OpenAI、Gemini、Ollama 等）都必须实现此接口，
 * 确保编辑器和自动化流程可以透明地切换后端。
 */

import { RegexItem, AstItem } from '../views/plugin_editor/types';
import { ThemeTranslationItem } from '../views/theme_editor/types';

/** Provider 类型枚举 */
export type ProviderType = 'openai' | 'gemini' | 'ollama';

/** Provider 枚举值映射（与 settings.llmApi 对应的数字） */
export const PROVIDER_ID_MAP: Record<number, ProviderType> = {
    1: 'openai',
    2: 'gemini',
    3: 'ollama',
};

/** 批次完成回调 (Regex) */
export type OnRegexBatchComplete = (
    batchResult: RegexItem[],
    batchIndex: number,
    totalBatches: number
) => void | Promise<void>;

/** 批次完成回调 (AST) */
export type OnAstBatchComplete = (
    batchResult: AstItem[],
    batchIndex: number,
    totalBatches: number
) => void | Promise<void>;

/** 批次完成回调 (Theme) */
export type OnThemeBatchComplete = (
    batchResult: ThemeTranslationItem[],
    batchIndex: number,
    totalBatches: number
) => void | Promise<void>;

/**
 * 翻译服务提供商统一接口
 */
export interface ITranslationProvider {
    /** Regex 模式批量翻译 */
    regexTranslate(
        items: RegexItem[],
        onBatchComplete: OnRegexBatchComplete,
        signal?: AbortSignal
    ): Promise<RegexItem[]>;

    /** AST 模式批量翻译 */
    astTranslate(
        items: AstItem[],
        onBatchComplete: OnAstBatchComplete,
        signal?: AbortSignal
    ): Promise<AstItem[]>;

    /** Theme 模式批量翻译 */
    themeTranslate(
        items: ThemeTranslationItem[],
        onBatchComplete: OnThemeBatchComplete,
        signal?: AbortSignal
    ): Promise<ThemeTranslationItem[]>;

    /** Token 数量与成本估算 */
    estimateTokens(
        items: any[],
        type: 'regex' | 'ast' | 'theme'
    ): { tokens: number; cost: number };
}
