"""rename legacy bridge history flag to local connector"""
from alembic import op

revision = "0004_rename_bridge_history_flag"
down_revision = "0003_local_connectors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE request_history RENAME COLUMN used_bridge TO used_local_connector")


def downgrade() -> None:
    op.execute("ALTER TABLE request_history RENAME COLUMN used_local_connector TO used_bridge")
