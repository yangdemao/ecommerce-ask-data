"""
结果分析节点

在 SQL 执行完成后，把查询结果（截断样例）和用户原始问题交给大模型，
生成三五句话的简短分析并通过流式输出回传前端。
本节点失败不影响主流程：结果已经推送给用户，异常时只记录日志并跳过。
"""

import yaml
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.runtime import Runtime

from app.agent.context import DataAgentContext
from app.agent.llm import llm
from app.agent.state import DataAgentState
from app.core.log import logger
from app.prompt.prompt_loader import load_prompt

# 只取前 N 行作为样例进入提示词，避免上下文过长拖慢分析或让模型发散
MAX_ANALYSIS_ROWS = 10


def _to_text(value):
    """把 Decimal、日期等非基础类型统一转成字符串，保证 YAML 序列化不报错"""

    if isinstance(value, (int, float, str, bool, type(None))):
        return value
    return str(value)


async def analyze_result(state: DataAgentState, runtime: Runtime[DataAgentContext]):
    """调用大模型对查询结果生成简短分析"""

    writer = runtime.stream_writer
    step = "结果分析"
    writer({"type": "progress", "step": step, "status": "running"})

    try:
        result = state.get("result") or []
        if not result:
            writer({"type": "progress", "step": step, "status": "success"})
            return {}

        # 截断前几行并保留列名与取值形态，作为分析样例
        preview = [
            {column: _to_text(value) for column, value in row.items()}
            for row in result[:MAX_ANALYSIS_ROWS]
        ]

        prompt = PromptTemplate(
            template=load_prompt("analyze_result"),
            input_variables=["query", "row_count", "result_preview"],
        )
        # 分析文案只需要纯文本，直接输出几句话
        output_parser = StrOutputParser()
        chain = prompt | llm | output_parser

        analysis = await chain.ainvoke(
            {
                "query": state["query"],
                "row_count": len(result),
                "result_preview": yaml.dump(
                    preview, allow_unicode=True, sort_keys=False
                ),
            }
        )
        analysis = str(analysis).strip()

        writer({"type": "progress", "step": step, "status": "success"})
        writer({"type": "analysis", "content": analysis})
        logger.info(f"结果分析成功: {analysis}")
        return {"analysis": analysis}

    except Exception as e:
        # 结果已推送，分析失败仅降级为无分析，不能中断整条链路
        logger.error(f"结果分析失败（已跳过）: {e}")
        writer({"type": "progress", "step": step, "status": "error"})
        return {}
