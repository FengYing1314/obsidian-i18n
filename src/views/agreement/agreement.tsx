import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/src/shadcn';
import { AgreementView } from './agreement-view';
import { agreementData } from './data';

/**
 * AgreementProps 接口定义
 * @property {AgreementView} view - 传入的协议视图实例，用于访问插件主逻辑 i18n 实例及视图控制
 */
interface AgreementProps {
    view: AgreementView;
}

/**
 * Agreement 组件 - 用户许可协议界面
 * 
 * 该组件是插件启动后的第一道“关卡”，主要功能包括：
 * 1. 强制阅读机制：通过监听滚动条位置，确保用户滑动到协议最底端后才激活“同意”按钮。
 * 2. 状态持久化：用户选择“同意”后，更新插件全量设置中的 agreement 标志位。
 * 3. 插件自保护：若用户“不同意”，则自动禁用插件，符合开源许可与用户隐私保护流程。
 */
export const Agreement: React.FC<AgreementProps> = ({ view }) => {
    // 使用 react-i18next 进行多语言文案适配
    const { t } = useTranslation();

    // 从 view 实例中解构出主类句柄，用于调用 settings 和内部方法
    const i18n = view.i18n;

    /**
     * @state isScrolledToBottom - 标记用户是否已经阅读（滚动）到了协议的最底部
     * 初始值为 false，用于禁用“同意”按钮，实现法律合规中的“强制阅读”流程。
     */
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);

    /**
     * @ref scrollRef - 指向协议正文的可滚动容器
     * 用于在必要时手动控制滚动位置或获取滚动高度数据。
     */
    const scrollRef = useRef<HTMLDivElement>(null);

    /**
     * handleScroll - 滚动事件监听器
     * 
     * 逻辑原理：
     * 通过计算 (总内容高度 - 当前滚动距离 - 容器可视高度) 来判断剩余未读内容。
     * 设定 20px 的阈值是为了兼容不同浏览器/缩放级别下可能产生的 1px 像素偏差。
     * 
     * @param {React.UIEvent<HTMLDivElement>} e - 滚动事件对象
     */
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        // 当剩余滚动距离小于 20 像素时，视为已读到底部
        if (scrollHeight - scrollTop - clientHeight < 20) {
            setIsScrolledToBottom(true);
        }
    };

    /**
     * handleAgree - 处理点击“同意”按钮的逻辑
     * 
     * 执行流程：
     * 1. 将插件配置中的 agreement 状态更新为 true (持久化存储)。
     * 2. 调用 i18n.saveSettings() 将变更写入磁盘。
     * 3. 触发 onAgreementAccepted 回调，执行如“拉取语言包”、“注册视图”等后续初始化流程。
     */
    const handleAgree = async () => {
        if (!i18n) return;

        // 修改配置项：标记已签署协议
        i18n.settings.agreement = true;
        await i18n.saveSettings();

        // 执行核心初始化任务（该方法定义在 main.ts 中，负责协议通过后的重载）
        await i18n.onAgreementAccepted();
    };

    /**
     * handleDisagree - 处理点击“不同意”按钮的逻辑
     * 
     * 执行流程：
     * 由于插件必须基于此协议运行，若不同意，插件将调用 Obsidian 内部 API 
     * 自行将其禁用 (disablePlugin)，并弹出原生通知告知用户。
     */
    const handleDisagree = async () => {
        if (!i18n) return;
        // @ts-ignore - 使用内部 API 禁用插件。由于 Obsidian API 的限制，需绕过部分类型检查。
        await i18n.app.plugins.disablePlugin(i18n.manifest.id);
    };

    return (
        /* 主容器：全屏居中，禁止文本选择以增强 UI 稳定性 */
        <div className="flex flex-col h-full bg-background p-6 items-center justify-center select-none text-standard">

            {/* 协议卡片：固定 90vh 高度，最大 4xl 宽度，确保在大屏幕和小屏幕上都有良好的阅读比例 */}
            <Card className="w-full max-w-4xl flex flex-col h-[90vh] shadow-2xl border-muted/40 ring-1 ring-border/10 overflow-hidden">

                {/* 顶部标题区：包含主标题与简洁的提示文案 */}
                <CardHeader className="border-b pb-6 bg-muted/5 shrink-0">
                    <CardTitle className="text-3xl text-center text-primary font-black tracking-tight uppercase">
                        {t('Agreement.Titles.Main')}
                    </CardTitle>
                    <p className="text-center text-xs font-bold text-muted-foreground/60 mt-2 uppercase tracking-widest">
                        {t('Agreement.Hints.Desc')}
                    </p>
                </CardHeader>

                {/* 内容展示区：核心可滚动部分 */}
                <CardContent className="flex-1 overflow-hidden p-0 relative bg-background/50">

                    {/* 滚动容器：应用平滑滚动效果与间距控制 */}
                    <div className="h-full overflow-y-auto p-10 space-y-10 text-sm text-foreground/80 leading-relaxed scroll-smooth no-scrollbar"
                        onScroll={handleScroll}
                        ref={scrollRef}
                    >
                        {/* 遍历本地化协议数据，动态生成章节与内容列表 */}
                        {Array.isArray(agreementData) && agreementData.map((section, idx) => (
                            <section key={idx} className="space-y-4">
                                <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    {section.title}
                                </h3>
                                <ul className="list-none space-y-3 pl-4 border-l-2 border-muted/20">
                                    {Array.isArray(section.content) && section.content.map((item: string, i: number) => (
                                        <li key={i} className="text-muted-foreground/80 leading-7 text-justify font-medium">
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}

                        {/* 脚注区域：说明更新日期或最后说明 */}
                        <div className="pt-10 pb-4 text-center text-muted-foreground/40 text-[10px] font-black uppercase tracking-tighter border-t border-dashed">
                            <p>{t('Agreement.Hints.End')}</p>
                        </div>
                    </div>

                    {/* 未读到末尾时的引导提示：采用 absolute 定位并配合 pulse 动画吸引注意力 */}
                    {!isScrolledToBottom && (
                        <div className="absolute bottom-6 right-10 bg-primary text-primary-foreground px-4 py-2 rounded-full text-[10px] font-black shadow-2xl shadow-primary/40 animate-pulse pointer-events-none backdrop-blur-md border border-white/10 uppercase tracking-widest">
                            {t('Agreement.Hints.Scroll')}
                        </div>
                    )}
                </CardContent>

                {/* 底部操作区：操作按钮与阅读进度提示 */}
                <div className="p-8 border-t bg-muted/5 flex flex-col sm:flex-row justify-end gap-6 items-center shrink-0">

                    {/* 进度提示：动态切换文案，告知用户当前的操作权限状态 */}
                    <div className="flex-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 text-center sm:text-left">
                        {isScrolledToBottom
                            ? <span className="text-emerald-500/80">{t('Agreement.Hints.ReadThanks')}</span>
                            : <span className="animate-in fade-in slide-in-from-left-2">{t('Agreement.Hints.ReadReminder')}</span>
                        }
                    </div>

                    {/* 按钮组：拒绝与同意。同意按钮受 isScrolledToBottom 严格限制 */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Button
                            variant="ghost"
                            onClick={handleDisagree}
                            className="flex-1 sm:flex-none h-10 px-6 text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-all"
                        >
                            {t('Agreement.Actions.Disagree')}
                        </Button>

                        <Button
                            onClick={handleAgree}
                            disabled={!isScrolledToBottom}
                            className={`flex-1 sm:flex-none h-10 min-w-[160px] text-[11px] font-black uppercase tracking-widest transition-all duration-500 shadow-xl ${isScrolledToBottom
                                ? "bg-primary hover:opacity-90 shadow-primary/20 scale-100"
                                : "bg-muted text-muted-foreground/30 scale-95 opacity-50 filter grayscale"
                                }`}
                        >
                            {t('Agreement.Actions.Agree')}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
