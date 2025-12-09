"""remove_upload_options_and_auto_approve_from_policy

Revision ID: dd4bfc2d9830
Revises: caf80094fe69
Create Date: 2025-12-08 23:37:35.749821

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'dd4bfc2d9830'
down_revision = 'caf80094fe69'
branch_labels = None
depends_on = None


def upgrade():
    # Remove the deprecated columns
    op.drop_column('extension_policies', 'allow_canvas_upload')
    op.drop_column('extension_policies', 'allow_email_upload')
    op.drop_column('extension_policies', 'auto_approve_with_documentation')


def downgrade():
    # Add the columns back in case of rollback
    op.add_column('extension_policies', sa.Column('auto_approve_with_documentation', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('extension_policies', sa.Column('allow_email_upload', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('extension_policies', sa.Column('allow_canvas_upload', sa.Boolean(), nullable=True, server_default='true'))
