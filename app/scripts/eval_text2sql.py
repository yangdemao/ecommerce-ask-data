"""
Text2SQL 执行准确率评测脚本

按业界常用的执行准确率（Execution Accuracy）评估问数链路：
1. 读取题集，在数仓中执行标准 SQL 得到期望结果集
2. 跑一遍完整的 LangGraph 问数链路，拿到模型生成的 SQL 和执行结果
3. 归一化结果集后比对，统计可执行率、准确率和平均耗时

只看结果是否一致，不要求模型生成的 SQL 与标准 SQL 写法相同。

用法：
    # 只校验题集里的标准 SQL 是否都能正常执行（不消耗大模型额度）
    uv run python -m app.scripts.eval_text2sql --check-golden

    # 跑全量评测，报告写入 eval/report.csv
    uv run python -m app.scripts.eval_text2sql

    # 只跑指定题号或限制条数
    uv run python -m app.scripts.eval_text2sql --ids E01 E04 E10
    uv run python -m app.scripts.eval_text2sql --limit 5
"""

import argparse
import asyncio
import csv
import time
from datetime import date, datetime, time as time_type
from decimal import Decimal
from pathlib import Path

import yaml
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.embedding_client_manager import embedding_client_manager
from app.clients.es_client_manager import es_client_manager
from app.clients.mysql_client_manager import (
    dw_mysql_client_manager,
    meta_mysql_client_manager,
)
from app.clients.qdrant_client_manager import qdrant_client_manager
from app.repositories.es.value_es_repository import ValueESRepository
from app.repositories.mysql.dw.dw_mysql_repository import DWMySQLRepository
from app.repositories.mysql.meta.meta_mysql_repository import MetaMySQLRepository
from app.repositories.qdrant.column_qdrant_repository import ColumnQdrantRepository
from app.repositories.qdrant.metric_qdrant_repository import MetricQdrantRepository

PROJECT_ROOT = Path(__file__).parents[2]
DEFAULT_QUESTIONS_FILE = PROJECT_ROOT / "eval" / "questions.yaml"
DEFAULT_REPORT_FILE = PROJECT_ROOT / "eval" / "report.csv"

# 浮点结果统一保留 4 位小数，避免 FLOAT 求和产生的精度尾差被判成错误
FLOAT_DIGITS = 4


def load_questions(path: Path) -> list[dict]:
    """读取题集，并做一次基础结构校验"""

    with path.open("r", encoding="utf-8") as file:
        questions = yaml.safe_load(file)

    if not isinstance(questions, list) or not questions:
        raise ValueError(f"题集格式不正确或为空：{path}")

    for item in questions:
        for field in ("id", "question", "golden_sql"):
            if field not in item:
                raise ValueError(f"题集条目缺少 {field} 字段：{item}")

    return questions


async def execute_sql(session: AsyncSession, sql: str) -> list[dict]:
    """在数仓中执行一条 SQL，并按字典列表返回结果"""

    result = await session.execute(text(sql))
    return [dict(row) for row in result.mappings().fetchall()]


def _normalize_value(value):
    """把结果值归一化成可比较的类型，消除数值精度和时间类型差异"""

    # bool 是 int 的子类，需要先单独处理
    if isinstance(value, bool):
        return value
    if isinstance(value, Decimal):
        return round(float(value), FLOAT_DIGITS)
    if isinstance(value, float):
        return round(value, FLOAT_DIGITS)
    if isinstance(value, (datetime, date, time_type)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    return value


def normalize_rows(rows: list[dict]) -> list[tuple]:
    """把结果集转成可比较的形式：值归一化 + 行排序

    行顺序不代表语义，所以按 repr 排序后再比较；按 repr 而非常规排序是为了
    兼容结果里同时出现字符串和数字的情况，避免 Python 无法比较混合类型。
    """

    normalized = [
        tuple(_normalize_value(value) for value in row.values()) for row in rows
    ]
    return sorted(normalized, key=repr)


def results_match(expected_rows: list[dict], actual_rows: list[dict]) -> bool:
    """比较两个结果集是否一致，行数 列数 每个值都要相同"""

    if len(expected_rows) != len(actual_rows):
        return False
    return normalize_rows(expected_rows) == normalize_rows(actual_rows)


async def run_agent(question: str, context) -> dict:
    """执行一次完整的问数链路，返回 LangGraph 的最终状态"""

    # 延迟导入，保证 --check-golden 模式不会初始化大模型客户端
    from app.agent.graph import graph
    from app.agent.state import DataAgentState

    state = DataAgentState(query=question)
    final_state: dict = {}

    # 同时订阅 custom（节点进度）和 values（节点执行后的完整状态）
    async for chunk in graph.astream(
        input=state, context=context, stream_mode=["custom", "values"]
    ):
        mode, payload = chunk if isinstance(chunk, tuple) else ("values", chunk)
        if mode == "values":
            final_state = payload

    return final_state


def build_summary(records: list[dict]) -> str:
    """把逐题结果汇总成可直接写进简历的统计信息"""

    valid = [record for record in records if record["golden_ok"]]
    total = len(valid)
    exec_ok = sum(1 for record in valid if record["exec_ok"])
    matched = sum(1 for record in valid if record["matched"])
    elapsed_list = [record["elapsed_s"] for record in valid if record["elapsed_s"]]

    def percent(value: int, base: int) -> str:
        return f"{value / base * 100:.1f}%" if base else "-"

    lines = [
        "=" * 52,
        f"题集条数：{total} 条（标准 SQL 执行失败 {len(records) - total} 条）",
        f"SQL 可执行率：{exec_ok}/{total}（{percent(exec_ok, total)}）",
        f"执行准确率 EX：{matched}/{total}（{percent(matched, total)}）",
        (
            f"平均端到端耗时：{sum(elapsed_list) / len(elapsed_list):.1f}s"
            if elapsed_list
            else "平均端到端耗时：-"
        ),
        "-" * 52,
    ]

    # 按难度拆分，方便定位模型在复杂问题上掉分的情况
    for level in ("easy", "medium", "hard"):
        level_records = [record for record in valid if record["difficulty"] == level]
        if not level_records:
            continue
        level_matched = sum(1 for record in level_records if record["matched"])
        lines.append(
            f"{level:<6}: {len(level_records)} 题，准确 {level_matched} "
            f"（{percent(level_matched, len(level_records))}）"
        )

    lines.append("=" * 52)
    return "\n".join(lines)


def write_report(records: list[dict], path: Path):
    """把逐题明细写入 CSV，utf-8-sig 保证 Excel 打开中文不乱码"""

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(
            [
                "题号",
                "问题",
                "难度",
                "考察点",
                "标准SQL执行成功",
                "模型SQL可执行",
                "结果一致",
                "耗时(秒)",
                "模型SQL",
                "错误信息",
            ]
        )
        for record in records:
            writer.writerow(
                [
                    record["id"],
                    record["question"],
                    record["difficulty"],
                    " ".join(record["tags"]),
                    record["golden_ok"],
                    record["exec_ok"],
                    record["matched"],
                    f"{record['elapsed_s']:.1f}",
                    record["model_sql"] or "",
                    record["error"] or "",
                ]
            )


async def check_golden(questions: list[dict]):
    """只校验标准 SQL 是否可执行，不调用大模型"""

    dw_mysql_client_manager.init()
    failed = 0
    try:
        async with dw_mysql_client_manager.session_factory() as session:
            for item in questions:
                try:
                    rows = await execute_sql(session, item["golden_sql"])
                    print(f"{item['id']}  OK    {len(rows)} 行")
                except Exception as error:
                    failed += 1
                    print(f"{item['id']}  ERROR {error}")
    finally:
        await dw_mysql_client_manager.close()

    print(f"\n标准 SQL 校验完成：{len(questions) - failed}/{len(questions)} 通过")
    return failed == 0


async def evaluate(questions: list[dict], report_path: Path):
    """跑完整评测链路，逐题打印进度并输出汇总"""

    from app.agent.context import DataAgentContext

    meta_mysql_client_manager.init()
    dw_mysql_client_manager.init()
    qdrant_client_manager.init()
    embedding_client_manager.init()
    es_client_manager.init()

    records: list[dict] = []
    try:
        async with (
            meta_mysql_client_manager.session_factory() as meta_session,
            dw_mysql_client_manager.session_factory() as dw_session,
        ):
            # 仓储和客户端只初始化一次，所有题目复用同一套依赖
            context = DataAgentContext(
                column_qdrant_repository=ColumnQdrantRepository(
                    qdrant_client_manager.client
                ),
                embedding_client=embedding_client_manager.client,
                metric_qdrant_repository=MetricQdrantRepository(
                    qdrant_client_manager.client
                ),
                value_es_repository=ValueESRepository(es_client_manager.client),
                meta_mysql_repository=MetaMySQLRepository(meta_session),
                dw_mysql_repository=DWMySQLRepository(dw_session),
            )

            for index, item in enumerate(questions, start=1):
                record = {
                    "id": item["id"],
                    "question": item["question"],
                    "difficulty": item.get("difficulty", "unknown"),
                    "tags": item.get("tags", []),
                    "golden_ok": False,
                    "exec_ok": False,
                    "matched": False,
                    "elapsed_s": 0.0,
                    "model_sql": None,
                    "error": None,
                }

                # 先执行标准 SQL，拿不到期望结果就没有比对基准
                try:
                    expected_rows = await execute_sql(dw_session, item["golden_sql"])
                    record["golden_ok"] = True
                except Exception as error:
                    record["error"] = f"标准SQL执行失败：{error}"
                    records.append(record)
                    print(f"[{index:>2}/{len(questions)}] {item['id']} GOLDEN-ERROR")
                    continue

                start = time.perf_counter()
                final_state: dict = {}
                try:
                    final_state = await run_agent(item["question"], context)
                    record["model_sql"] = final_state.get("sql")
                    actual_rows = final_state.get("result")
                    record["exec_ok"] = actual_rows is not None
                    if actual_rows is not None:
                        record["matched"] = results_match(expected_rows, actual_rows)
                except Exception as error:
                    record["error"] = str(error)
                record["elapsed_s"] = time.perf_counter() - start

                if record["matched"]:
                    status = "PASS"
                elif record["exec_ok"]:
                    status = "MISMATCH"
                else:
                    status = "ERROR"
                print(
                    f"[{index:>2}/{len(questions)}] {item['id']} {status:<8} "
                    f"{record['elapsed_s']:>5.1f}s  {item['question']}"
                )
                records.append(record)
    finally:
        await meta_mysql_client_manager.close()
        await dw_mysql_client_manager.close()
        await qdrant_client_manager.close()
        await es_client_manager.close()

    write_report(records, report_path)
    print()
    print(build_summary(records))
    print(f"逐题报告：{report_path}")
    return records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Text2SQL 执行准确率评测")
    parser.add_argument(
        "-q",
        "--questions",
        default=str(DEFAULT_QUESTIONS_FILE),
        help="题集文件路径，默认 eval/questions.yaml",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_REPORT_FILE),
        help="报告输出路径，默认 eval/report.csv",
    )
    parser.add_argument(
        "--ids", nargs="*", help="只跑指定题号，例如 --ids E01 E04"
    )
    parser.add_argument("--limit", type=int, help="只跑前 N 条，便于快速验证")
    parser.add_argument(
        "--check-golden",
        action="store_true",
        help="只校验标准 SQL 是否可执行，不调用大模型",
    )
    args = parser.parse_args()

    # 按题号和条数过滤题目，过滤后的顺序保持与题集一致
    all_questions = load_questions(Path(args.questions))
    if args.ids:
        wanted = {item.upper() for item in args.ids}
        all_questions = [
            item for item in all_questions if item["id"].upper() in wanted
        ]
    if args.limit:
        all_questions = all_questions[: args.limit]

    if not all_questions:
        raise SystemExit("没有匹配到任何题目，请检查 --ids / --limit 参数")

    if args.check_golden:
        asyncio.run(check_golden(all_questions))
    else:
        asyncio.run(evaluate(all_questions, Path(args.output)))
