"""add approved_clients table

Revision ID: a1b2c3d4e5f6
Revises: f7g8h9i0j1k2
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'approved_clients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.String(255), nullable=False),
        sa.Column('issuer', sa.String(255), nullable=False),
        sa.Column('org_name', sa.String(255), nullable=True),
        sa.Column('approved_by', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('approved_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_approved_clients_client_id', 'approved_clients', ['client_id'], unique=True)


def downgrade():
    op.drop_index('ix_approved_clients_client_id', table_name='approved_clients')
    op.drop_table('approved_clients')
