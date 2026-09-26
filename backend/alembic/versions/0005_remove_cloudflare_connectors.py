"""remove Cloudflare connector storage; rename local history flag

Revision ID: 0005_remove_cloudflare_connectors
Revises: 0004_rename_bridge_history_flag
Create Date: 2026-09-27
"""
from alembic import op

revision = "0005_remove_cloudflare_connectors"
down_revision = "0004_rename_bridge_history_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE request_history RENAME COLUMN used_local_connector TO used_local_request")
    op.execute("DROP TABLE IF EXISTS local_connectors CASCADE")


def downgrade() -> None:
    from alembic import op as _op
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    _op.execute("ALTER TABLE request_history RENAME COLUMN used_local_request TO used_local_connector")
    _op.create_table(
        "local_connectors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tunnel_id", sa.String(length=64), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("connector_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("tunnel_token_encrypted", sa.Text(), nullable=False),
        sa.Column("dns_record_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_local_connector_user"),
        sa.UniqueConstraint("tunnel_id", name="uq_local_connector_tunnel"),
        sa.UniqueConstraint("hostname", name="uq_local_connector_hostname"),
    )
    _op.create_index("ix_local_connectors_user_id", "local_connectors", ["user_id"], unique=False)
