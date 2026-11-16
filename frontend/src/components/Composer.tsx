/**
 * 聊天输入区组件
 * 处理问题输入、发送和停止当前流式请求
 */
import { ArrowUp, Square, WandSparkles } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef } from "react";
import { cn } from "../lib/format";

type ComposerProps = {
    value: string;
    disabled: boolean;
    isStreaming: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop: () => void;
};

export function Composer({
    value,
    disabled,
    isStreaming,
    onChange,
    onSubmit,
    onStop,
}: ComposerProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!disabled) onSubmit();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled) onSubmit();
        }
    };

    return (
        <form
            onSubmit={submit}
            className="border-t border-rule bg-white/55 px-4 py-4 backdrop-blur-xl"
        >
            <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-rule bg-white/75 p-2 shadow-pop">
                <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent sm:grid">
                    <WandSparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="问一个电商数据问题..."
                    className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-6 text-ink outline-none placeholder:text-faint"
                />
                <button
                    type={isStreaming ? "button" : "submit"}
                    onClick={isStreaming ? onStop : undefined}
                    disabled={!isStreaming && disabled}
                    data-ripple="light"
                    className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2",
                        isStreaming
                            ? "bg-danger hover:bg-danger/90"
                            : "bg-brand-gradient hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                    title={isStreaming ? "停止" : "发送"}
                    aria-label={isStreaming ? "停止" : "发送"}
                >
                    {isStreaming ? (
                        <Square
                            className="h-4 w-4 fill-current"
                            aria-hidden="true"
                        />
                    ) : (
                        <ArrowUp className="h-5 w-5" aria-hidden="true" />
                    )}
                </button>
            </div>
        </form>
    );
}
