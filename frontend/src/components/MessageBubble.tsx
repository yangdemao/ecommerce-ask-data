/**
 * 聊天消息气泡组件
 * 组合展示用户问题、智能体回复、执行流程和结果表格
 */
import { Bot, Copy, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ResultTable } from "./ResultTable";
import { StepRail } from "./StepRail";
import { cn, formatTime, toClipboardText } from "../lib/format";
import type { ChatMessage } from "../types/agent";

/**
 * 打字机效果：文本变化且启用时逐段浮现，流式阶段原样展示不重复动画
 */
function useTypewriter(text: string, enabled: boolean) {
  const [shown, setShown] = useState(text);
  const prevRef = useRef(text);

  useEffect(() => {
    if (!enabled || prevRef.current === text) {
      prevRef.current = text;
      setShown(text);
      return;
    }
    prevRef.current = text;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }

    let index = 0;
    const step = Math.max(1, Math.ceil(text.length / 45));
    const timer = window.setInterval(() => {
      index = Math.min(text.length, index + step);
      setShown(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, [text, enabled]);

  return { shown, typing: enabled && shown !== text };
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const { shown, typing } = useTypewriter(
    message.content,
    !isUser && message.status !== "streaming",
  );

  const copy = async () => {
    const text = message.result ? toClipboardText(message.result) : message.content;
    await navigator.clipboard.writeText(text);
  };

  return (
    <article className={cn("msg-in group flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-white shadow-glow">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
      )}

      <div className={cn("max-w-[920px] flex-1", isUser && "flex max-w-[760px] justify-end")}>
        <div
          className={cn(
            "relative rounded-2xl border px-5 py-4 shadow-glow",
            isUser
              ? "border-transparent bg-brand-gradient text-white"
              : "border-rule bg-white/70 text-ink backdrop-blur-xl",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-wrap text-[15px] leading-7">
              {isUser ? message.content : shown}
              {typing && <span className="tw-caret" aria-hidden="true" />}
            </p>
            {!isUser && message.status !== "streaming" && (
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-full p-1.5 text-faint opacity-0 outline-none transition hover:bg-accent/10 hover:text-accent focus:opacity-100 focus:ring-2 focus:ring-accent/40 group-hover:opacity-100"
                title="复制"
                aria-label="复制"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {message.error && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {message.error}
            </div>
          )}

          {!isUser && <StepRail steps={message.steps} />}
          {!isUser && message.result !== undefined && <ResultTable data={message.result} />}

          <div
            className={cn(
              "mt-3 text-xs",
              isUser ? "text-white/70" : "text-faint",
            )}
          >
            {formatTime(message.createdAt)}
          </div>
        </div>
      </div>

      {isUser && (
        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white shadow-glow">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </article>
  );
}
