"""导入所有模型以触发 SQLAlchemy 注册。"""
from app.db.models.agent import AgentConfig  # noqa: F401
from app.db.models.conversation import Conversation, Message  # noqa: F401
from app.db.models.project import Project  # noqa: F401
from app.db.models.requirement import Requirement, Subtask  # noqa: F401
from app.db.models.review import ReviewReport  # noqa: F401
from app.db.models.performance import PerformanceReport  # noqa: F401
from app.db.models.document import Document  # noqa: F401

__all__ = [
    "AgentConfig", "Conversation", "Message",
    "Project", "Requirement", "Subtask",
    "ReviewReport", "PerformanceReport", "Document",
]