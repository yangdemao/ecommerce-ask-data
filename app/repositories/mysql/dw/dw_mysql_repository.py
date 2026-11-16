"""
数仓 MySQL 仓储

这一层对应文档里的 DW Repository，职责是到真实数仓中补齐配置文件里
没有显式维护的信息，例如字段类型和字段示例值。Service 层只关心
“需要哪些信息”，具体怎样查数仓由仓储层统一封装
SQL 生成闭环中的数据库环境读取 SQL 校验和最终查询执行也集中放在这里
"""

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# 问数链路最终只允许执行查询语句，避免模型生成的 SQL 改动数仓数据或结构
READ_ONLY_PREFIXES = ("select", "with", "show", "desc", "describe", "explain")

# 出现以下关键字说明语句可能修改数据或结构，即使以 with 开头也要拒绝
FORBIDDEN_KEYWORDS = (
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "truncate",
    "create",
    "grant",
    "revoke",
    "rename",
    "replace into",
    "load data",
    "outfile",
    "dumpfile",
)

# 未显式写 LIMIT 的查询自动补一个行数上限，避免一次把整表拉回内存
DEFAULT_ROW_LIMIT = 1000


def _strip_literals_and_comments(sql: str) -> str:
    """去掉字符串常量和注释，避免把字面量里的词误判成关键字"""

    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"'[^']*'", "''", sql)
    sql = re.sub(r'"[^"]*"', '""', sql)
    return sql


def ensure_read_only(sql: str) -> str:
    """校验语句是否为只读查询，并返回去掉末尾分号后的 SQL"""

    cleaned = _strip_literals_and_comments(sql).strip().lower()

    if not cleaned.startswith(READ_ONLY_PREFIXES):
        raise ValueError("只允许执行只读查询语句，当前 SQL 不是查询")

    for keyword in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{keyword}\b", cleaned):
            raise ValueError(f"SQL 中包含禁止执行的关键字：{keyword}")

    return sql.strip().rstrip(";").strip()


def apply_row_limit(sql: str, limit: int = DEFAULT_ROW_LIMIT) -> str:
    """给没有写 LIMIT 的查询补一个行数上限"""

    # 已经有 LIMIT 的查询保持原样，避免出现两个 LIMIT 导致语法错误
    if re.search(r"\blimit\b", sql, re.IGNORECASE):
        return sql
    return f"{sql}\nLIMIT {limit}"


class DWMySQLRepository:
    """负责查询数仓真实表结构和字段样例值"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_column_types(self, table_name: str) -> dict[str, str]:
        """查询整张表的字段类型，作为 ColumnInfo.type 的真实来源"""
        sql = f"show columns from {table_name}"
        result = await self.session.execute(text(sql))
        result_dict = result.mappings().fetchall()
        return {row["Field"]: row["Type"] for row in result_dict}

    async def get_column_values(
        self, table_name: str, column_name: str, limit: int = 10
    ) -> list:
        """抽样查询字段示例值，供元数据入库和后续检索链路复用"""
        sql = f"select distinct {column_name} from {table_name} limit {limit}"
        result = await self.session.execute(text(sql))
        return [row[0] for row in result.fetchall()]

    async def get_db_info(self):
        """读取当前数仓数据库的方言和版本，供 SQL 生成提示词使用"""

        sql = "select version()"
        result = await self.session.execute(text(sql))
        version = result.scalar()

        # dialect 来自 SQLAlchemy 当前绑定的数据库方言，例如 mysql
        dialect = self.session.bind.dialect.name
        return {"dialect": dialect, "version": version}

    async def validate(self, sql: str):
        """用 EXPLAIN 让数据库提前解析 SQL，发现语法 表名 字段名等错误"""

        # 只读校验放在 EXPLAIN 之前，让非查询语句进入修正分支而不是直接被执行
        sql = ensure_read_only(sql)
        await self.session.execute(text(f"explain {sql}"))

    async def run(self, sql: str) -> list[dict]:
        """执行最终 SQL，并把 SQLAlchemy 行对象转换成前端更易消费的字典列表"""

        # 执行前再做一次只读校验和行数限制，作为校验节点之外的第二道防线
        safe_sql = apply_row_limit(ensure_read_only(sql))
        result = await self.session.execute(text(safe_sql))
        return [dict(row) for row in result.mappings().fetchall()]
