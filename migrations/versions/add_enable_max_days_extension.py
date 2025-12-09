"""add enable_max_days_extension field

Revision ID: f7g8h9i0j1k2
Revises: dd4bfc2d9830
Create Date: 2025-12-09 00:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7g8h9i0j1k2'
down_revision = 'dd4bfc2d9830'
branch_labels = None
depends_on = None


def upgrade():
    # Add the enable_max_days_extension column
    with op.batch_alter_table('extension_policies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('enable_max_days_extension', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    # Remove the column if rolling back
    with op.batch_alter_table('extension_policies', schema=None) as batch_op:
        batch_op.drop_column('enable_max_days_extension')
