"""repair OAuth identity uniqueness

Revision ID: 0002_oauth_identity_unique
Revises: 0001_initial
Create Date: 2026-09-26

The Google auth handler uses PostgreSQL ON CONFLICT against
(provider, provider_account_id). Older production databases were created
without that unique constraint even though the SQLAlchemy model now declares
it. This migration repairs the live schema and removes duplicate identities
before adding the constraint.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_oauth_identity_unique"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
                                                                          
                                                                           
                                                                         
    op.execute(
        sa.text(
            """
            DELETE FROM oauth_accounts
            WHERE ctid IN (
                SELECT row_ctid
                FROM (
                    SELECT
                        ctid AS row_ctid,
                        ROW_NUMBER() OVER (
                            PARTITION BY provider, provider_account_id
                            ORDER BY created_at ASC NULLS LAST, id ASC
                        ) AS row_number
                    FROM oauth_accounts
                ) ranked
                WHERE row_number > 1
            )
            """
        )
    )

                                                                        
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'uq_oauth_identity'
                      AND conrelid = 'oauth_accounts'::regclass
                ) THEN
                    ALTER TABLE oauth_accounts
                    ADD CONSTRAINT uq_oauth_identity
                    UNIQUE (provider, provider_account_id);
                END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            ALTER TABLE oauth_accounts
            DROP CONSTRAINT IF EXISTS uq_oauth_identity;
            """
        )
    )
