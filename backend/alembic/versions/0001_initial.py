"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "oauth_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_account_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("provider", "provider_account_id", name="uq_oauth_identity"),
    )
    op.create_index("ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"])

    op.create_table(
        "collections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("position", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_collections_user_id", "collections", ["user_id"])

    op.create_table(
        "api_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(160), server_default="Untitled request"),
        sa.Column("method", sa.String(10), server_default="GET"),
        sa.Column("url", sa.Text, nullable=False, server_default=""),
        sa.Column("params", postgresql.JSONB, server_default="[]"),
        sa.Column("headers", postgresql.JSONB, server_default="[]"),
        sa.Column("auth", postgresql.JSONB, server_default="{}"),
        sa.Column("body", sa.Text, server_default=""),
        sa.Column("position", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_requests_user_id", "api_requests", ["user_id"])
    op.create_index("ix_requests_collection_id", "api_requests", ["collection_id"])
    op.create_index("ix_requests_user_collection", "api_requests", ["user_id", "collection_id"])

    op.create_table(
        "assertions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("path", sa.String(255), server_default=""),
        sa.Column("expected", sa.String(255), server_default=""),
        sa.Column("enabled", sa.Boolean, server_default=sa.true()),
        sa.Column("position", sa.Integer, server_default="0"),
    )
    op.create_index("ix_assertions_request_id", "assertions", ["request_id"])

    op.create_table(
        "environments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("position", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_environment_name_per_user"),
    )
    op.create_index("ix_environments_user_id", "environments", ["user_id"])

    op.create_table(
        "environment_variables",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("environment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("environments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("value", sa.Text, server_default=""),
        sa.Column("secret", sa.Boolean, server_default=sa.false()),
        sa.Column("position", sa.Integer, server_default="0"),
        sa.UniqueConstraint("environment_id", "name", name="uq_var_name_per_env"),
    )
    op.create_index("ix_environment_variables_environment_id", "environment_variables", ["environment_id"])

    op.create_table(
        "request_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_requests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("status", sa.Integer, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("used_bridge", sa.Boolean, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_request_history_user_id", "request_history", ["user_id"])
    op.create_index("ix_request_history_request_id", "request_history", ["request_id"])
    op.create_index("ix_request_history_created_at", "request_history", ["created_at"])


def downgrade() -> None:
    op.drop_table("request_history")
    op.drop_table("environment_variables")
    op.drop_table("environments")
    op.drop_table("assertions")
    op.drop_table("api_requests")
    op.drop_table("collections")
    op.drop_table("oauth_accounts")
    op.drop_table("users")
