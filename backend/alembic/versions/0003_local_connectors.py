"""add per-user Outpath Cloudflare local connector"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_local_connectors"
down_revision = "0002_oauth_identity_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
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
    op.create_index("ix_local_connectors_user_id", "local_connectors", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_local_connectors_user_id", table_name="local_connectors")
    op.drop_table("local_connectors")
